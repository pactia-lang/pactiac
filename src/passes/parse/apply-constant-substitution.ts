import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Diagnostic } from "../../domain/diagnostics.js";
import { DiagnosticCode, createDiagnostic } from "../../domain/index.js";
import {
  SyntaxNodeKind,
  type ModuleNode,
  type ProseNode,
  type ProductNode,
  type ProgramNode,
  type SyntaxTree,
  type TagBodyItem,
} from "../../domain/syntax-tree.js";
import { substituteModuleConstants } from "./substitute-constants.js";

function walkTagBodyItems(
  items: readonly TagBodyItem[],
  constants: ReadonlyMap<string, string>,
  diagnostics: Diagnostic[],
  locationFile: string,
): TagBodyItem[] {
  return items.map((item) => {
    if (item.kind === SyntaxNodeKind.Prose) {
      return substituteProseNode(item, constants, diagnostics, locationFile);
    }
    if (item.kind === SyntaxNodeKind.TagBlock) {
      return {
        ...item,
        items: walkTagBodyItems(item.items, constants, diagnostics, locationFile),
      };
    }
    return item;
  });
}

function substituteProseNode(
  item: ProseNode,
  constants: ReadonlyMap<string, string>,
  diagnostics: Diagnostic[],
  locationFile: string,
): ProseNode {
  const result = substituteModuleConstants(item.text, constants);
  for (const name of result.unresolved) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCode.ConstantUndefined,
        `Module constant '${name}' is not defined`,
        { target: name, location: { ...item.location, file: locationFile } },
      ),
    );
  }
  return { ...item, text: result.text };
}

function applyToModule(
  module: ModuleNode,
  constants: ReadonlyMap<string, string>,
  diagnostics: Diagnostic[],
): ModuleNode {
  const moduleConstants = new Map(constants);
  for (const item of module.items) {
    if (item.kind === SyntaxNodeKind.ModuleConst) {
      moduleConstants.set(item.name, item.value);
    }
  }

  const items = module.items.map((item) => {
    if (item.kind === SyntaxNodeKind.Service) {
      const serviceConstants = new Map(moduleConstants);
      for (const serviceItem of item.items) {
        if (serviceItem.kind === SyntaxNodeKind.ModuleConst) {
          serviceConstants.set(serviceItem.name, serviceItem.value);
        }
      }
      return {
        ...item,
        items: item.items.map((serviceItem) => {
          if (serviceItem.kind === SyntaxNodeKind.ModuleConst) return serviceItem;
          if (serviceItem.kind === SyntaxNodeKind.Prose) {
            return substituteProseNode(serviceItem, serviceConstants, diagnostics, module.location.file);
          }
          if (serviceItem.kind === SyntaxNodeKind.TagBlock) {
            return {
              ...serviceItem,
              items: walkTagBodyItems(serviceItem.items, serviceConstants, diagnostics, module.location.file),
            };
          }
          return serviceItem;
        }),
      };
    }
    if (item.kind === SyntaxNodeKind.Model) {
      return {
        ...item,
        items: walkTagBodyItems(item.items, moduleConstants, diagnostics, module.location.file),
      };
    }
    if (item.kind === SyntaxNodeKind.TagBlock) {
      return {
        ...item,
        items: walkTagBodyItems(item.items, moduleConstants, diagnostics, module.location.file),
      };
    }
    return item;
  });

  return { ...module, items };
}

function applyToProduct(
  product: ProductNode,
  constants: ReadonlyMap<string, string>,
  diagnostics: Diagnostic[],
): ProductNode {
  const items = product.items.map((item) => {
    if (item.kind === SyntaxNodeKind.Module) {
      return applyToModule(item, constants, diagnostics);
    }
    if (item.kind === SyntaxNodeKind.TagBlock) {
      return {
        ...item,
        items: walkTagBodyItems(item.items, constants, diagnostics, product.location.file),
      };
    }
    if (item.kind === SyntaxNodeKind.Prose) {
      return substituteProseNode(item, constants, diagnostics, product.location.file);
    }
    return item;
  });
  return { ...product, items };
}

export function applyConstantSubstitution(
  tree: SyntaxTree,
  importedConstants: ReadonlyMap<string, string>,
): { readonly tree: SyntaxTree; readonly diagnostics: readonly Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const product = tree.root.product
    ? applyToProduct(tree.root.product, importedConstants, diagnostics)
    : undefined;

  return {
    tree: {
      ...tree,
      root: { ...tree.root, product },
    },
    diagnostics,
  };
}

export function collectExportedConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  const pattern = /export\s+def\s+(\w+)\s*=\s*(.+)$/gm;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    constants.set(match[1]!, match[2]!.trim());
    match = pattern.exec(source);
  }
  return constants;
}

export function importedConstantsFromProgram(program: ProgramNode, workspaceRoot: string): Map<string, string> {
  const constants = new Map<string, string>();

  for (const imp of program.imports) {
    if (imp.path.startsWith("@") || !imp.symbols) continue;
    const filePath = resolve(workspaceRoot, imp.path);
    if (!existsSync(filePath)) continue;
    const fileConstants = collectExportedConstants(readFileSync(filePath, "utf8"));
    for (const symbol of imp.symbols) {
      const name = symbol.replace(/^[@#]+/, "");
      const value = fileConstants.get(name);
      if (value !== undefined) constants.set(name, value);
    }
  }

  return constants;
}
