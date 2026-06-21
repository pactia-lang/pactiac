import {
  BoundNodeKind,
  DiagnosticCode,
  IrFile,
  IrMerge,
  PlacementTarget,
  RegistryEntryKind,
  createDiagnostic,
  type BoundMacroNode,
  type BoundTagNode,
  type BoundTreeItem,
  type EffectiveRegistry,
} from "../../domain/index.js";
import type { Diagnostic } from "../../domain/diagnostics.js";
import {
  SyntaxNodeKind,
  type MacroInvocationNode,
  type TagBlockNode,
  type TagBodyItem,
  type TagPrefixNode,
  type SourceLocation,
} from "../../domain/syntax-tree.js";

export class BodyItemBinder {
  constructor(
    private readonly registry: EffectiveRegistry,
    private readonly diagnostics: Diagnostic[],
  ) {}

  bindItems(items: readonly TagBodyItem[], enclosing: PlacementTarget): BoundTreeItem[] {
    const bound: BoundTreeItem[] = [];
    for (const item of items) {
      switch (item.kind) {
        case SyntaxNodeKind.TagBlock:
          bound.push(this.bindTagBlock(item, enclosing));
          break;
        case SyntaxNodeKind.TagPrefix:
          bound.push(this.bindTagPrefix(item, enclosing));
          break;
        case SyntaxNodeKind.MacroInvocation:
          bound.push(this.bindMacroInvocation(item, enclosing));
          break;
        case SyntaxNodeKind.FieldLine:
        case SyntaxNodeKind.Prose:
          bound.push(item);
          break;
        default:
          break;
      }
    }
    return bound;
  }

  private bindTagBlock(tag: TagBlockNode, enclosing: PlacementTarget): BoundTagNode {
    const entry = this.resolveTag(tag.tagName, tag.location);
    return {
      kind: BoundNodeKind.BoundTag,
      tagName: tag.tagName,
      hostId: tag.hostId,
      registryEntry: entry,
      enclosing,
      children: this.bindItems(tag.items, enclosing),
      location: tag.location,
    };
  }

  private bindTagPrefix(tag: TagPrefixNode, enclosing: PlacementTarget): BoundTagNode {
    const entry = this.resolveTag(tag.tagName, tag.location);
    return {
      kind: BoundNodeKind.BoundTag,
      tagName: tag.tagName,
      shorthand: tag.shorthand,
      registryEntry: entry,
      enclosing,
      children: [],
      location: tag.location,
    };
  }

  private bindMacroInvocation(
    macro: MacroInvocationNode,
    enclosing: PlacementTarget,
  ): BoundMacroNode {
    const entry = this.resolveMacro(macro.name, macro.location);
    return {
      kind: BoundNodeKind.BoundMacro,
      name: macro.name,
      registryEntry: entry,
      enclosing,
      args: macro.args,
      location: macro.location,
    };
  }

  private resolveTag(tagName: string, location: SourceLocation): BoundTagNode["registryEntry"] {
    const entry = this.registry.tags.get(tagName);
    if (!entry) {
      this.diagnostics.push(
        createDiagnostic(DiagnosticCode.UnknownSymbol, `Unknown tag '@${tagName}'`, {
          location,
          target: tagName,
        }),
      );
      return this.stubTagEntry(tagName);
    }
    return entry;
  }

  private resolveMacro(
    macroName: string,
    location: SourceLocation,
  ): BoundMacroNode["registryEntry"] {
    const entry = this.registry.macros.get(macroName);
    if (!entry) {
      this.diagnostics.push(
        createDiagnostic(DiagnosticCode.MacroUnknown, `Unknown macro '#${macroName}'`, {
          location,
          target: macroName,
        }),
      );
      return this.stubMacroEntry(macroName);
    }
    return entry;
  }

  private stubTagEntry(name: string): BoundTagNode["registryEntry"] {
    return {
      kind: RegistryEntryKind.Tag,
      name,
      source: "unresolved",
      in: [],
      fields: { required: [], optional: [], modifier: false, openExtension: false },
      modifier: false,
      ir: { file: IrFile.Product, path: "extensions[]", merge: IrMerge.MergeFields },
    };
  }

  private stubMacroEntry(name: string): BoundMacroNode["registryEntry"] {
    return {
      kind: RegistryEntryKind.Macro,
      name,
      source: "unresolved",
      in: [],
      params: [],
      body: { lines: [], items: [] },
    };
  }
}
