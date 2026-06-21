import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Diagnostic } from "../../domain/diagnostics.js";
import {
  attachKindMismatchDiagnostic,
  attachUndefinedDiagnostic,
} from "../../passes/workspace/workspace-diagnostics.js";
import { extractBlockAfter, findMatchingBrace } from "../kernel/brace.js";
import type { MergedWorkspaceSource, WorkspaceFiles } from "./types.js";

const PRODUCT_FILE = "product.pactia";

export enum FragmentExportKind {
  Module = "module",
  Service = "service",
  Model = "model",
}

export interface FragmentExport {
  readonly kind: FragmentExportKind;
  readonly name: string;
  readonly body: string;
  readonly filePath: string;
}

export interface AttachServiceRef {
  readonly serviceSymbol: string;
  readonly modelSymbol?: string;
}

export interface AttachModuleRef {
  readonly moduleSymbol: string;
  readonly services: readonly AttachServiceRef[];
}

function indentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${pad}${line}` : line))
    .join("\n");
}

export function hasAttachComposition(productSource: string): boolean {
  return /module\s*\(\s*\w+\s*\)\s*\{/.test(productSource);
}

function extractExportBlock(
  source: string,
  kind: FragmentExportKind,
  name: string,
  filePath: string,
): FragmentExport | undefined {
  const pattern = new RegExp(`export\\s+${kind}\\s+${name}\\s*\\{`);
  const match = pattern.exec(source);
  if (!match || match.index === undefined) return undefined;
  const openBrace = match.index + match[0].length - 1;
  const closeBrace = findMatchingBrace(source, openBrace);
  return {
    kind,
    name,
    body: source.slice(openBrace + 1, closeBrace).trimEnd(),
    filePath,
  };
}

function indexFragmentExports(filePath: string, source: string): FragmentExport[] {
  const exports: FragmentExport[] = [];
  for (const kind of [
    FragmentExportKind.Module,
    FragmentExportKind.Service,
    FragmentExportKind.Model,
  ] as const) {
    const pattern = new RegExp(`export\\s+${kind}\\s+(\\w+)\\s*\\{`, "g");
    let match: RegExpExecArray | null = pattern.exec(source);
    while (match) {
      const name = match[1]!;
      const block = extractExportBlock(source, kind, name, filePath);
      if (block) exports.push(block);
      match = pattern.exec(source);
    }
  }
  return exports;
}

function parsePartialImportPaths(productSource: string, productDir: string): string[] {
  const paths: string[] = [];
  const pattern = /import\s*\{[^}]+\}\s+from\s+([^;]+);/g;
  let match: RegExpExecArray | null = pattern.exec(productSource);
  while (match) {
    const rawPath = match[1]!.trim().replace(/^["']|["']$/g, "");
    if (rawPath.startsWith("@")) {
      match = pattern.exec(productSource);
      continue;
    }
    const resolved = resolve(productDir, rawPath);
    if (existsSync(resolved)) paths.push(resolved);
    match = pattern.exec(productSource);
  }
  return paths;
}

function buildFragmentRegistry(productSource: string, productDir: string): Map<string, FragmentExport> {
  const registry = new Map<string, FragmentExport>();
  for (const filePath of parsePartialImportPaths(productSource, productDir)) {
    const source = readFileSync(filePath, "utf8");
    for (const exportDecl of indexFragmentExports(filePath, source)) {
      if (registry.has(exportDecl.name)) {
        throw new Error(
          `Duplicate fragment export '${exportDecl.name}' in ${exportDecl.filePath} and ${registry.get(exportDecl.name)?.filePath}`,
        );
      }
      registry.set(exportDecl.name, exportDecl);
    }
  }
  return registry;
}

function parseAttachModules(productBody: string): AttachModuleRef[] {
  const modules: AttachModuleRef[] = [];
  const pattern = /module\s*\(\s*(\w+)\s*\)\s*\{/g;
  let match: RegExpExecArray | null = pattern.exec(productBody);
  while (match) {
    const moduleSymbol = match[1]!;
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(productBody, openBrace);
    const attachBody = productBody.slice(openBrace + 1, closeBrace);
    const services: AttachServiceRef[] = [];
    const servicePattern = /service\s*\(\s*(\w+)\s*\)\s*\{/g;
    let serviceMatch: RegExpExecArray | null = servicePattern.exec(attachBody);
    while (serviceMatch) {
      const serviceSymbol = serviceMatch[1]!;
      const serviceOpen = serviceMatch.index + serviceMatch[0].length - 1;
      const serviceClose = findMatchingBrace(attachBody, serviceOpen);
      const serviceBody = attachBody.slice(serviceOpen + 1, serviceClose);
      const modelMatch = /model\s*\(\s*(\w+)\s*\)/.exec(serviceBody);
      services.push({
        serviceSymbol,
        modelSymbol: modelMatch?.[1],
      });
      serviceMatch = servicePattern.exec(attachBody);
    }
    modules.push({ moduleSymbol, services });
    match = pattern.exec(productBody);
  }
  return modules;
}

export interface MergedAttachWorkspaceSource extends MergedWorkspaceSource {
  readonly diagnostics: readonly Diagnostic[];
}

interface ResolveExportResult {
  readonly exportDecl?: FragmentExport;
  readonly diagnostic?: Diagnostic;
}

function tryResolveExport(
  registry: Map<string, FragmentExport>,
  symbol: string,
  expected: FragmentExportKind,
  contextFile: string,
): ResolveExportResult {
  const exportDecl = registry.get(symbol);
  if (!exportDecl) {
    return { diagnostic: attachUndefinedDiagnostic(symbol, contextFile) };
  }
  if (exportDecl.kind !== expected) {
    return {
      diagnostic: attachKindMismatchDiagnostic(symbol, expected, exportDecl.kind, exportDecl.filePath),
    };
  }
  return { exportDecl };
}

function buildAttachedModuleBlock(
  attach: AttachModuleRef,
  registry: Map<string, FragmentExport>,
  productPath: string,
): { readonly block?: string; readonly diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const moduleResult = tryResolveExport(
    registry,
    attach.moduleSymbol,
    FragmentExportKind.Module,
    productPath,
  );
  if (moduleResult.diagnostic) {
    diagnostics.push(moduleResult.diagnostic);
    return { diagnostics };
  }
  const moduleExport = moduleResult.exportDecl!;
  const parts: string[] = [moduleExport.body];

  for (const serviceRef of attach.services) {
    if (serviceRef.modelSymbol) {
      const modelResult = tryResolveExport(
        registry,
        serviceRef.modelSymbol,
        FragmentExportKind.Model,
        productPath,
      );
      if (modelResult.diagnostic) {
        diagnostics.push(modelResult.diagnostic);
        continue;
      }
      parts.push(
        ["model {", indentBlock(modelResult.exportDecl!.body, 2), "}"].join("\n"),
      );
    }
    const serviceResult = tryResolveExport(
      registry,
      serviceRef.serviceSymbol,
      FragmentExportKind.Service,
      productPath,
    );
    if (serviceResult.diagnostic) {
      diagnostics.push(serviceResult.diagnostic);
      continue;
    }
    const serviceExport = serviceResult.exportDecl!;
    parts.push(`service ${serviceExport.name} {\n${indentBlock(serviceExport.body, 2)}\n}`);
  }

  const combined = parts.filter((part) => part.length > 0).join("\n\n");
  return {
    block: [`module ${moduleExport.name} {`, indentBlock(combined, 2), "}"].join("\n"),
    diagnostics,
  };
}

function extractProductHeader(productSource: string): {
  versionLine: string;
  imports: string;
  productName: string;
  productBody: string;
} {
  const versionMatch = /^\s*(pactia\s+[0-9]+(?:\.[0-9]+)?)/m.exec(productSource);
  const versionLine = versionMatch?.[1] ?? "pactia 1.0";

  const imports: string[] = [];
  const importLinePattern = /^\s*import\s+.+;/gm;
  let importMatch: RegExpExecArray | null = importLinePattern.exec(productSource);
  while (importMatch) {
    const line = importMatch[0]!.trim();
    const fromMatch = /\bfrom\s+(\S+)\s*;/.exec(line);
    const fromPath = fromMatch?.[1]?.replace(/^["']|["']$/g, "") ?? "";
    if (!fromPath.startsWith("./") && !fromPath.startsWith("../")) {
      imports.push(line);
    }
    importMatch = importLinePattern.exec(productSource);
  }

  const productBlock = extractBlockAfter(productSource, /product\s+(\w+)\s*\{/);
  if (!productBlock) {
    throw new Error("product.pactia must declare a product block");
  }

  let productBody = productBlock.body;
  const attachModule = /module\s*\(\s*\w+\s*\)\s*\{/.exec(productBody);
  if (attachModule && attachModule.index !== undefined) {
    productBody = productBody.slice(0, attachModule.index).trimEnd();
  }

  return {
    versionLine,
    imports: imports.join("\n"),
    productName: productBlock.id,
    productBody: productBody.trimEnd(),
  };
}

export function mergeAttachedWorkspace(files: WorkspaceFiles): MergedAttachWorkspaceSource {
  const productDir = dirname(files.productPath);
  const registry = buildFragmentRegistry(files.productSource, productDir);
  const productBlock = extractBlockAfter(files.productSource, /product\s+(\w+)\s*\{/);
  if (!productBlock) {
    throw new Error("product.pactia must declare a product block");
  }

  const attachModules = parseAttachModules(productBlock.body);
  if (attachModules.length === 0) {
    throw new Error("Attach workspace requires module(name) { … } blocks in product.pactia");
  }

  const { versionLine, imports, productName, productBody } = extractProductHeader(files.productSource);
  const diagnostics: Diagnostic[] = [];
  const moduleBlocks: string[] = [];
  for (const attach of attachModules) {
    const built = buildAttachedModuleBlock(attach, registry, files.productPath);
    diagnostics.push(...built.diagnostics);
    if (built.block) moduleBlocks.push(built.block);
  }

  const productInner = [productBody, ...moduleBlocks].filter((part) => part.length > 0).join("\n\n");
  const source = [versionLine, imports, "", `product ${productName} {`, productInner, "}"]
    .filter((part) => part.length > 0)
    .join("\n")
    .concat("\n");

  return {
    source,
    entry: PRODUCT_FILE,
    lockfileDigest: undefined,
    diagnostics,
  };
}
