import { SyntaxNodeKind, type ModuleNode, type ModuleConstNode } from "../../domain/syntax-tree.js";

const INTERPOLATION_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function substituteModuleConstants(
  text: string,
  constants: ReadonlyMap<string, string>,
): { readonly text: string; readonly unresolved: readonly string[] } {
  const unresolved = new Set<string>();
  const replaced = text.replace(INTERPOLATION_PATTERN, (match, name: string) => {
    const value = constants.get(name);
    if (value === undefined) {
      unresolved.add(name);
      return match;
    }
    return value;
  });
  return { text: replaced, unresolved: [...unresolved] };
}

export function moduleConstantsFromModules(modules: readonly ModuleNode[]): Map<string, string> {
  const constants = new Map<string, string>();
  for (const module of modules) {
    for (const item of module.items) {
      if (item.kind === SyntaxNodeKind.ModuleConst) {
        constants.set(item.name, (item as ModuleConstNode).value);
      }
    }
  }
  return constants;
}
