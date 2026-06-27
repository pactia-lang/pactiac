import {
  BoundNodeKind,
  DiagnosticCode,
  placementAllows,
  createDiagnostic,
  type BoundBlockNode,
  type BoundMacroNode,
  type BoundTree,
  type BoundTreeItem,
  type EffectiveRegistry,
} from "../../domain/index.js";
import type { Diagnostic } from "../../domain/diagnostics.js";
import {
  SyntaxNodeKind,
  type FieldLineNode,
  type ProseNode,
  type SourceLocation,
  type TagBodyItem,
  type TagBlockNode,
  type MacroInvocationNode,
  type TagPrefixNode,
} from "../../domain/syntax-tree.js";
import { BodyItemBinder } from "../bind/body-item-binder.js";

const MAX_EXPANSION_PASSES = 64;
const PARAM_PATTERN = /\$\{([^}]+)\}/g;

export interface ExpandBoundTreeResult {
  readonly tree: BoundTree;
  readonly diagnostics: readonly Diagnostic[];
}

export function expandBoundTree(
  tree: BoundTree,
  registry: EffectiveRegistry,
  expansionRegistry: EffectiveRegistry = registry,
): ExpandBoundTreeResult {
  const diagnostics: Diagnostic[] = [];
  let root = tree.root;
  let pass = 0;

  while (containsMacroNode(root) && pass < MAX_EXPANSION_PASSES) {
    const expander = new MacroExpander(registry, expansionRegistry, diagnostics);
    root = expander.expandBlock(root, new Set());
    pass += 1;
  }

  if (containsMacroNode(root)) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCode.MacroExpansionCycle,
        "Macro expansion did not reach a fixed point",
      ),
    );
  }

  return { tree: { entryFile: tree.entryFile, root }, diagnostics };
}

class MacroExpander {
  private readonly binder: BodyItemBinder;

  constructor(
    private readonly registry: EffectiveRegistry,
    expansionRegistry: EffectiveRegistry,
    private readonly diagnostics: Diagnostic[],
  ) {
    this.binder = new BodyItemBinder(expansionRegistry, diagnostics);
  }

  expandBlock(block: BoundBlockNode, visiting: Set<string>): BoundBlockNode {
    return {
      ...block,
      children: this.expandItems(block.children, block.placement, visiting),
    };
  }

  private expandItems(
    items: readonly BoundTreeItem[],
    enclosing: BoundBlockNode["placement"],
    visiting: Set<string>,
  ): BoundTreeItem[] {
    const expanded: BoundTreeItem[] = [];
    for (const item of items) {
      expanded.push(...this.expandItem(item, enclosing, visiting));
    }
    return expanded;
  }

  private expandItem(
    item: BoundTreeItem,
    enclosing: BoundBlockNode["placement"],
    visiting: Set<string>,
  ): BoundTreeItem[] {
    if (item.kind === BoundNodeKind.BoundMacro) {
      return this.expandMacro(item, enclosing, visiting);
    }
    if (item.kind === BoundNodeKind.BoundBlock) {
      return [this.expandBlock(item, visiting)];
    }
    if (item.kind === BoundNodeKind.BoundTag) {
      return [
        {
          ...item,
          children: this.expandItems(item.children, enclosing, visiting),
        },
      ];
    }
    return [item];
  }

  private expandMacro(
    macro: BoundMacroNode,
    enclosing: BoundBlockNode["placement"],
    visiting: Set<string>,
  ): BoundTreeItem[] {
    const entry = macro.registryEntry;
    if (entry.source === "unresolved") {
      return [macro];
    }

    if (!placementAllows(entry.in, macro.enclosing)) {
      this.diagnostics.push(
        createDiagnostic(
          DiagnosticCode.PlacementViolation,
          `Macro '#${macro.name}' is not allowed in ${macro.enclosing}`,
          { location: macro.location, target: macro.name },
        ),
      );
      return [macro];
    }

    if (macro.args.length !== entry.params.length) {
      this.diagnostics.push(
        createDiagnostic(
          DiagnosticCode.MacroArgsInvalid,
          `Macro '#${macro.name}' expects ${entry.params.length} argument(s), got ${macro.args.length}`,
          { location: macro.location, target: macro.name },
        ),
      );
      return [macro];
    }

    if (visiting.has(macro.name)) {
      this.diagnostics.push(
        createDiagnostic(
          DiagnosticCode.MacroExpansionCycle,
          `Macro expansion cycle detected at '#${macro.name}'`,
          { location: macro.location, target: macro.name },
        ),
      );
      return [macro];
    }

    visiting.add(macro.name);
    const substituted = substituteBodyItems(
      entry.body.items,
      entry.params,
      macro.args,
      macro.location,
    );
    const spliced = this.binder.bindItems(substituted, enclosing);

    const expanded: BoundTreeItem[] = [];
    for (const item of spliced) {
      expanded.push(...this.expandItem(item, enclosing, visiting));
    }
    visiting.delete(macro.name);
    return expanded;
  }
}

function containsMacroNode(block: BoundBlockNode): boolean {
  return block.children.some((child) => treeItemContainsMacro(child));
}

function treeItemContainsMacro(item: BoundTreeItem): boolean {
  if (item.kind === BoundNodeKind.BoundMacro) return true;
  if (item.kind === BoundNodeKind.BoundBlock) return containsMacroNode(item);
  if (item.kind === BoundNodeKind.BoundTag) {
    return item.children.some((child) => treeItemContainsMacro(child));
  }
  return false;
}

function substituteBodyItems(
  items: readonly TagBodyItem[],
  params: readonly string[],
  args: readonly string[],
  location: SourceLocation,
): TagBodyItem[] {
  const bindings = new Map<string, string>();
  for (let index = 0; index < params.length; index += 1) {
    bindings.set(params[index]!, args[index] ?? "");
  }

  return items.map((item) => substituteBodyItem(item, bindings, location));
}

function substituteBodyItem(
  item: TagBodyItem,
  bindings: Map<string, string>,
  location: SourceLocation,
): TagBodyItem {
  switch (item.kind) {
    case SyntaxNodeKind.FieldLine:
      return substituteFieldLine(item, bindings, location);
    case SyntaxNodeKind.Prose:
      return substituteProse(item, bindings, location);
    case SyntaxNodeKind.TagBlock:
      return substituteTagBlock(item, bindings, location);
    case SyntaxNodeKind.TagPrefix:
      return substituteTagPrefix(item, bindings, location);
    case SyntaxNodeKind.MacroInvocation:
      return substituteMacroInvocation(item, bindings, location);
    default:
      return item;
  }
}

function substituteFieldLine(
  item: FieldLineNode,
  bindings: Map<string, string>,
  location: SourceLocation,
): FieldLineNode {
  if (item.value === undefined) return { ...item, location: mergeLocation(item.location, location) };
  return {
    ...item,
    value: substituteText(item.value, bindings),
    location: mergeLocation(item.location, location),
  };
}

function substituteProse(
  item: ProseNode,
  bindings: Map<string, string>,
  location: SourceLocation,
): ProseNode {
  return {
    ...item,
    text: substituteText(item.text, bindings),
    location: mergeLocation(item.location, location),
  };
}

function substituteTagBlock(
  item: TagBlockNode,
  bindings: Map<string, string>,
  location: SourceLocation,
): TagBlockNode {
  return {
    ...item,
    items: item.items.map((child) => substituteBodyItem(child, bindings, location)),
    location: mergeLocation(item.location, location),
  };
}

function substituteTagPrefix(
  item: TagPrefixNode,
  bindings: Map<string, string>,
  location: SourceLocation,
): TagPrefixNode {
  return {
    ...item,
    shorthand: item.shorthand ? substituteText(item.shorthand, bindings) : undefined,
    location: mergeLocation(item.location, location),
  };
}

function substituteMacroInvocation(
  item: MacroInvocationNode,
  bindings: Map<string, string>,
  location: SourceLocation,
): MacroInvocationNode {
  return {
    ...item,
    args: item.args.map((arg) => substituteText(arg, bindings)),
    location: mergeLocation(item.location, location),
  };
}

function substituteText(text: string, bindings: Map<string, string>): string {
  if (bindings.has(text)) {
    return bindings.get(text) ?? text;
  }
  return text.replace(PARAM_PATTERN, (_match, name: string) => bindings.get(name) ?? "");
}

function mergeLocation(original: SourceLocation, fallback: SourceLocation): SourceLocation {
  return {
    file: original.file || fallback.file,
    line: original.line || fallback.line,
    col: original.col || fallback.col,
    span: original.span ?? fallback.span,
  };
}
