import { dirname, resolve } from "node:path";
import { extractBlockAfter } from "../kernel/brace.js";
import { hasAttachComposition, mergeAttachedWorkspace } from "./attach-merge.js";
import type { MergedWorkspaceSource, WorkspaceFiles, WorkspaceModuleFiles } from "./types.js";

const PRODUCT_FILE = "product.pactia";

function indentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${pad}${line}` : line))
    .join("\n");
}

function stripOuterBlock(source: string, keyword: string): string {
  const block = extractBlockAfter(source, new RegExp(`${keyword}\\s+(\\w+)\\s*\\{`));
  if (!block) {
    throw new Error(`Expected '${keyword} <name> { ... }' block in workspace fragment`);
  }
  return block.body.trimEnd();
}

function resolveImportPath(serviceFilePath: string, importPath: string): string {
  const normalized = importPath.replace(/^["']|["']$/g, "");
  if (normalized.startsWith("./") || normalized.startsWith("../")) {
    return resolve(dirname(serviceFilePath), normalized);
  }
  return normalized;
}

function expandServiceImports(
  serviceFilePath: string,
  serviceBody: string,
  module: WorkspaceModuleFiles,
): string {
  const importPattern = /^\s*import\s+["']([^"']+)["']\s*;/gm;
  const chunks: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = importPattern.exec(serviceBody);

  while (match) {
    chunks.push(serviceBody.slice(lastIndex, match.index));
    const importPath = resolveImportPath(serviceFilePath, match[1]!);
    const feature =
      module.featureFiles.get(importPath) ??
      module.entityFiles.get(importPath) ??
      [...module.featureFiles.entries(), ...module.entityFiles.entries()].find(([path]) =>
        resolve(path) === importPath,
      )?.[1];

    if (!feature) {
      throw new Error(
        `Service '${serviceFilePath}' imports '${match[1]}' but no matching feature/entity file was found`,
      );
    }
    chunks.push(feature.trim());
    chunks.push("\n\n");
    lastIndex = match.index + match[0].length;
    match = importPattern.exec(serviceBody);
  }

  chunks.push(serviceBody.slice(lastIndex));
  return chunks
    .join("")
    .replace(importPattern, "")
    .trim();
}

function extractServicePrefix(source: string): string {
  const serviceMatch = /service\s+\w+\s*\{/.exec(source);
  if (!serviceMatch || serviceMatch.index === undefined) return "";
  return source.slice(0, serviceMatch.index).trimEnd();
}

function buildServiceBlock(
  module: WorkspaceModuleFiles,
  service: WorkspaceModuleFiles["services"][number],
): string {
  const prefix = extractServicePrefix(service.source);
  const inner = stripOuterBlock(service.source, "service");
  const body = expandServiceImports(service.path, inner, module);
  const lines = [`    ${prefix}`, `    service ${service.serviceName} {`, indentBlock(body, 6), "    }"].filter(
    (line) => line.length > 0,
  );
  return lines.join("\n");
}

function buildModuleBlock(module: WorkspaceModuleFiles): string {
  const moduleBody = stripOuterBlock(module.moduleSource, "module");
  const serviceBlocks = module.services.map((svc) => buildServiceBlock(module, svc));
  const combined = [moduleBody, ...serviceBlocks].filter((part) => part.length > 0).join("\n\n");
  return [`  module ${module.moduleName} {`, indentBlock(combined, 4), "  }"].join("\n");
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
  const importPattern = /^\s*import\s+(@[\w/-]+)\s*;/gm;
  let importMatch: RegExpExecArray | null = importPattern.exec(productSource);
  while (importMatch) {
    imports.push(importMatch[0]!.trim());
    importMatch = importPattern.exec(productSource);
  }

  const productBlock = extractBlockAfter(productSource, /product\s+(\w+)\s*\{/);
  if (!productBlock) {
    throw new Error("product.pactia must declare a product block");
  }

  let productBody = productBlock.body;
  const inlineModule = /module\s+\w+\s*\{/.exec(productBody);
  if (inlineModule && inlineModule.index !== undefined) {
    productBody = productBody.slice(0, inlineModule.index).trimEnd();
  }

  return {
    versionLine,
    imports: imports.join("\n"),
    productName: productBlock.id,
    productBody: productBody.trimEnd(),
  };
}

export function mergeWorkspaceSources(files: WorkspaceFiles): MergedWorkspaceSource {
  if (hasAttachComposition(files.productSource)) {
    return mergeAttachedWorkspace(files);
  }

  const { versionLine, imports, productName, productBody } = extractProductHeader(files.productSource);
  const moduleBlocks = files.modules.map((mod) => buildModuleBlock(mod));

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
