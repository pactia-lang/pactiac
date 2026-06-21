import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

function resolveExport(
  registry: Map<string, FragmentExport>,
  symbol: string,
  expected: FragmentExportKind,
): FragmentExport {
  const exportDecl = registry.get(symbol);
  if (!exportDecl) {
    throw new Error(`Attach references undefined symbol '${symbol}'`);
  }
  if (exportDecl.kind !== expected) {
    throw new Error(
      `Attach kind mismatch for '${symbol}': expected ${expected}, got ${exportDecl.kind}`,
    );
  }
  return exportDecl;
}

function buildAttachedModuleBlock(
  attach: AttachModuleRef,
  registry: Map<string, FragmentExport>,
): string {
  const moduleExport = resolveExport(registry, attach.moduleSymbol, FragmentExportKind.Module);
  const parts: string[] = [moduleExport.body];

  for (const serviceRef of attach.services) {
    const modelExport = serviceRef.modelSymbol
      ? resolveExport(registry, serviceRef.modelSymbol, FragmentExportKind.Model)
      : undefined;
    if (modelExport) {
      parts.push(["model {", indentBlock(modelExport.body, 2), "}"].join("\n"));
    }
    const serviceExport = resolveExport(registry, serviceRef.serviceSymbol, FragmentExportKind.Service);
    parts.push(`service ${serviceExport.name} {\n${indentBlock(serviceExport.body, 2)}\n}`);
  }

  const combined = parts.filter((part) => part.length > 0).join("\n\n");
  return [`module ${moduleExport.name} {`, indentBlock(combined, 2), "}"].join("\n");
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
  const packageImportPattern = /^\s*import\s+(@[\w/-]+)\s*;/gm;
  let importMatch: RegExpExecArray | null = packageImportPattern.exec(productSource);
  while (importMatch) {
    imports.push(importMatch[0]!.trim());
    importMatch = packageImportPattern.exec(productSource);
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

export function mergeAttachedWorkspace(files: WorkspaceFiles): MergedWorkspaceSource {
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
  const moduleBlocks = attachModules.map((attach) => buildAttachedModuleBlock(attach, registry));
  const productInner = [productBody, ...moduleBlocks].filter((part) => part.length > 0).join("\n\n");
  const source = [versionLine, imports, "", `product ${productName} {`, productInner, "}"]
    .filter((part) => part.length > 0)
    .join("\n")
    .concat("\n");

  return {
    source,
    entry: PRODUCT_FILE,
    lockfileDigest: undefined,
  };
}
