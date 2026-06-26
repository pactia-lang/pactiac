import {
  BoundNodeKind,
  DiagnosticCode,
  IrBodySlot,
  IrFile,
  IrMerge,
  PlacementTarget,
  RegistryEntryKind,
  createDiagnostic,
  type BoundBlockNode,
  type BoundContextNode,
  type BoundDefNode,
  type BoundTree,
  type BoundTreeItem,
  type EffectiveRegistry,
} from "../../domain/index.js";
import type { Diagnostic } from "../../domain/diagnostics.js";
import { parseContextPathField } from "../../domain/context-path.js";
import {
  DefSigil,
  SyntaxNodeKind,
  type ContextAttachNode,
  type ContextBlockNode,
  type DefDeclNode,
  type ModelItem,
  type ModelNode,
  type ModuleItem,
  type ModuleNode,
  type ProductItem,
  type ProductNode,
  type ProgramNode,
  type ServiceItem,
  type ServiceNode,
  type SyntaxTree,
  type TagBodyItem,
} from "../../domain/syntax-tree.js";
import { BodyItemBinder } from "./body-item-binder.js";

const PACKAGE_INDEX_FILE = "index.pactia";

export interface BindSyntaxTreeResult {
  readonly tree: BoundTree;
  readonly diagnostics: readonly Diagnostic[];
}

export function bindSyntaxTree(
  syntax: SyntaxTree,
  registry: EffectiveRegistry,
): BindSyntaxTreeResult {
  const diagnostics: Diagnostic[] = [];
  const binder = new SyntaxTreeBinder(syntax, registry, diagnostics);
  return { tree: binder.bind(), diagnostics };
}

class SyntaxTreeBinder {
  private readonly bodyItemBinder: BodyItemBinder;

  constructor(
    private readonly syntax: SyntaxTree,
    private readonly registry: EffectiveRegistry,
    private readonly diagnostics: Diagnostic[],
  ) {
    this.bodyItemBinder = new BodyItemBinder(registry, diagnostics);
  }

  bind(): BoundTree {
    this.checkExportDefsInProduct();
    const root = this.bindProductOrEmpty(this.syntax.root);
    return { entryFile: this.syntax.entryFile, root };
  }

  private checkExportDefsInProduct(): void {
    if (this.syntax.entryFile === PACKAGE_INDEX_FILE) return;
    for (const def of this.syntax.root.exportDefs) {
      this.diagnostics.push(
        createDiagnostic(
          DiagnosticCode.DefInProduct,
          `export def ${def.sigil === DefSigil.Macro ? "#" : "@"}${def.name} is only allowed in package index.pactia`,
          { location: def.location, target: def.name },
        ),
      );
    }
  }

  private bindProductOrEmpty(program: ProgramNode): BoundBlockNode {
    if (!program.product) {
      return {
        kind: BoundNodeKind.BoundBlock,
        placement: PlacementTarget.Product,
        children: [],
        location: program.location,
      };
    }
    return this.bindProduct(program.product);
  }

  private bindProduct(product: ProductNode): BoundBlockNode {
    const children: BoundTreeItem[] = [];
    for (const item of product.items) {
      children.push(...this.bindProductItems(item, PlacementTarget.Product));
    }
    return {
      kind: BoundNodeKind.BoundBlock,
      placement: PlacementTarget.Product,
      hostName: product.name,
      children,
      location: product.location,
    };
  }

  private bindModule(module: ModuleNode): BoundBlockNode {
    const children: BoundTreeItem[] = [];
    for (const item of module.items) {
      children.push(...this.bindModuleItems(item, PlacementTarget.Module));
    }
    return {
      kind: BoundNodeKind.BoundBlock,
      placement: PlacementTarget.Module,
      hostName: module.name,
      children,
      location: module.location,
    };
  }

  private bindModel(model: ModelNode): BoundBlockNode {
    const children: BoundTreeItem[] = [];
    for (const item of model.items) {
      children.push(...this.bindModelItems(item, PlacementTarget.Model));
    }
    return {
      kind: BoundNodeKind.BoundBlock,
      placement: PlacementTarget.Model,
      children,
      location: model.location,
    };
  }

  private bindService(service: ServiceNode): BoundBlockNode {
    const children: BoundTreeItem[] = [];
    for (const item of service.items) {
      children.push(...this.bindServiceItems(item, PlacementTarget.Service));
    }
    return {
      kind: BoundNodeKind.BoundBlock,
      placement: PlacementTarget.Service,
      hostName: service.name,
      children,
      location: service.location,
    };
  }

  private bindProductItems(item: ProductItem, enclosing: PlacementTarget): BoundTreeItem[] {
    switch (item.kind) {
      case SyntaxNodeKind.Module:
        return [this.bindModule(item)];
      case SyntaxNodeKind.AttachModule:
        return [];
      case SyntaxNodeKind.Context:
        return this.bindContextBlock(item);
      case SyntaxNodeKind.ContextAttach:
        return this.bindContextAttach(item);
      default:
        return this.bindTagLikeItems([item], enclosing);
    }
  }

  private bindModuleItems(item: ModuleItem, enclosing: PlacementTarget): BoundTreeItem[] {
    switch (item.kind) {
      case SyntaxNodeKind.Service:
        return [this.bindService(item)];
      case SyntaxNodeKind.Model:
        return [this.bindModel(item)];
      case SyntaxNodeKind.DefExport:
      case SyntaxNodeKind.DefLocal:
        return [this.bindDefDecl(item)];
      case SyntaxNodeKind.ModuleConst:
        return [item];
      case SyntaxNodeKind.Context:
        return this.bindContextBlock(item);
      case SyntaxNodeKind.ContextAttach:
        return this.bindContextAttach(item);
      default:
        return this.bindTagLikeItems([item], enclosing);
    }
  }

  private bindModelItems(item: ModelItem, enclosing: PlacementTarget): BoundTreeItem[] {
    switch (item.kind) {
      case SyntaxNodeKind.Context:
        return this.bindContextBlock(item);
      case SyntaxNodeKind.ContextAttach:
        return this.bindContextAttach(item);
      default:
        return this.bindTagLikeItems([item], enclosing);
    }
  }

  private bindServiceItems(item: ServiceItem, enclosing: PlacementTarget): BoundTreeItem[] {
    switch (item.kind) {
      case SyntaxNodeKind.Context:
        return this.bindContextBlock(item);
      case SyntaxNodeKind.ContextAttach:
        return this.bindContextAttach(item);
      default:
        return this.bindTagLikeItems([item], enclosing);
    }
  }

  private bindTagLikeItems(
    items: readonly (ProductItem | ModuleItem | ModelItem | ServiceItem | TagBodyItem)[],
    enclosing: PlacementTarget,
  ): BoundTreeItem[] {
    const tagBodyItems = items.filter(
      (item): item is TagBodyItem =>
        item.kind === SyntaxNodeKind.TagBlock ||
        item.kind === SyntaxNodeKind.TagPrefix ||
        item.kind === SyntaxNodeKind.MacroInvocation ||
        item.kind === SyntaxNodeKind.FieldLine ||
        item.kind === SyntaxNodeKind.Prose,
    );
    return this.bodyItemBinder.bindItems(tagBodyItems, enclosing);
  }

  private bindContextBlock(block: ContextBlockNode): BoundTreeItem[] {
    const bound = this.toBoundContext(block.name, block.pathRaw, block.guidance, block.location);
    return bound ? [bound] : [];
  }

  private bindContextAttach(attach: ContextAttachNode): BoundTreeItem[] {
    const exported = this.registry.contexts.get(attach.symbol);
    if (!exported) {
      this.diagnostics.push(
        createDiagnostic(
          DiagnosticCode.ContextAttachUndefined,
          `Context attach references undefined symbol '${attach.symbol}'`,
          { location: attach.location, target: attach.symbol },
        ),
      );
      return [];
    }
    const bound = this.toBoundContext(
      attach.symbol,
      exported.pathRaw,
      exported.guidance,
      attach.location,
      exported.coordinate,
    );
    return bound ? [bound] : [];
  }

  private toBoundContext(
    name: string,
    pathRaw: string | undefined,
    guidance: readonly string[],
    location: ContextBlockNode["location"],
    packageCoordinate?: string,
  ): BoundContextNode | undefined {
    const path = parseContextPathField(pathRaw);
    if (!path) {
      this.diagnostics.push(
        createDiagnostic(
          DiagnosticCode.ContextMissingPath,
          `Context '${name}' is missing required path field`,
          { location, target: name },
        ),
      );
      return undefined;
    }
    return {
      kind: BoundNodeKind.BoundContext,
      name,
      path,
      guidance,
      packageCoordinate,
      location,
    };
  }

  private bindDefDecl(def: DefDeclNode): BoundDefNode {
    const entry = this.resolveDefEntry(def);
    if (def.exported && this.syntax.entryFile !== PACKAGE_INDEX_FILE) {
      // Diagnostic already emitted in checkExportDefsInProduct for root export defs.
    }
    return {
      kind: BoundNodeKind.BoundDef,
      name: def.name,
      exported: def.exported,
      registryEntry: entry,
      location: def.location,
    };
  }

  private resolveDefEntry(def: DefDeclNode): BoundDefNode["registryEntry"] {
    if (def.sigil === DefSigil.Macro) {
      const entry = this.registry.macros.get(def.name);
      if (entry) return entry;
      this.diagnostics.push(
        createDiagnostic(
          DiagnosticCode.MacroUnknown,
          `Unknown macro def '#${def.name}'`,
          { location: def.location, target: def.name },
        ),
      );
      return {
        kind: RegistryEntryKind.Macro,
        name: def.name,
        source: "unresolved",
        in: [],
        params: [],
        body: { lines: [], items: [] },
      };
    }

    const entry = this.registry.tags.get(def.name);
    if (entry) return entry;
    this.diagnostics.push(
      createDiagnostic(
        DiagnosticCode.UnknownSymbol,
        `Unknown tag def '@${def.name}'`,
        { location: def.location, target: def.name },
      ),
    );
    return {
      kind: RegistryEntryKind.Tag,
      name: def.name,
      source: "unresolved",
      in: [],
      fields: { required: [], optional: [], modifier: false, openExtension: false },
      modifier: false,
      ir: { file: IrFile.Product, path: IrBodySlot.BodyArray, merge: IrMerge.AppendHost },
    };
  }
}
