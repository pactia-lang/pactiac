import type { PlacementTarget } from "./placement.js";

/** Source span for diagnostics — byte offsets into assembled workspace text. */
export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly col: number;
  readonly span?: SourceSpan;
}

export enum SyntaxNodeKind {
  Workspace = "workspace",
  Product = "product",
  Module = "module",
  AttachModule = "attach-module",
  AttachService = "attach-service",
  Model = "model",
  Service = "service",
  TagBlock = "tag-block",
  TagPrefix = "tag-prefix",
  MacroInvocation = "macro-invocation",
  DefExport = "def-export",
  DefLocal = "def-local",
  ModuleConst = "module-const",
  FieldLine = "field-line",
  Prose = "prose",
  Import = "import",
  Context = "context",
  ContextAttach = "context-attach",
}

export enum DefSigil {
  Tag = "tag",
  Macro = "macro",
}

export interface ContextBlockNode {
  readonly kind: SyntaxNodeKind.Context;
  readonly name: string;
  readonly exported: boolean;
  readonly path?: string;
  readonly pathRaw?: string;
  readonly guidance: readonly string[];
  readonly location: SourceLocation;
}

export interface ContextAttachNode {
  readonly kind: SyntaxNodeKind.ContextAttach;
  readonly symbol: string;
  readonly location: SourceLocation;
}

export interface ImportNode {
  readonly kind: SyntaxNodeKind.Import;
  readonly path: string;
  readonly symbols?: readonly string[];
  readonly location: SourceLocation;
}

export interface ProseNode {
  readonly kind: SyntaxNodeKind.Prose;
  readonly text: string;
  readonly multiline: boolean;
  readonly location: SourceLocation;
}

export interface FieldLineNode {
  readonly kind: SyntaxNodeKind.FieldLine;
  readonly name: string;
  readonly value?: string;
  readonly required: boolean;
  readonly location: SourceLocation;
}

export interface TagBlockNode {
  readonly kind: SyntaxNodeKind.TagBlock;
  readonly tagName: string;
  readonly hostId?: string;
  readonly items: readonly TagBodyItem[];
  readonly location: SourceLocation;
}

export interface TagPrefixNode {
  readonly kind: SyntaxNodeKind.TagPrefix;
  readonly tagName: string;
  readonly shorthand?: string;
  readonly modifier: boolean;
  readonly location: SourceLocation;
}

export interface MacroInvocationNode {
  readonly kind: SyntaxNodeKind.MacroInvocation;
  readonly name: string;
  readonly args: readonly string[];
  readonly location: SourceLocation;
}

export type TagBodyItem =
  | FieldLineNode
  | ProseNode
  | TagBlockNode
  | TagPrefixNode
  | MacroInvocationNode;

export interface DefDeclNode {
  readonly kind: SyntaxNodeKind.DefExport | SyntaxNodeKind.DefLocal;
  readonly exported: boolean;
  readonly sigil: DefSigil;
  readonly name: string;
  readonly params: readonly string[];
  readonly inTargets: readonly PlacementTarget[];
  readonly modifier: boolean;
  readonly bodyItems: readonly TagBodyItem[];
  readonly bodySource: string;
  readonly location: SourceLocation;
}

export interface ModuleConstNode {
  readonly kind: SyntaxNodeKind.ModuleConst;
  readonly name: string;
  readonly value: string;
  readonly location: SourceLocation;
}

export interface ServiceNode {
  readonly kind: SyntaxNodeKind.Service;
  readonly name: string;
  readonly items: readonly ServiceItem[];
  readonly location: SourceLocation;
}

export interface ModelNode {
  readonly kind: SyntaxNodeKind.Model;
  readonly name?: string;
  readonly items: readonly ModelItem[];
  readonly location: SourceLocation;
}

export type ServiceItem =
  | TagBlockNode
  | TagPrefixNode
  | MacroInvocationNode
  | ProseNode
  | FieldLineNode
  | ModuleConstNode
  | ContextBlockNode
  | ContextAttachNode;
export type ModelItem =
  | TagBlockNode
  | TagPrefixNode
  | MacroInvocationNode
  | ProseNode
  | FieldLineNode
  | ContextBlockNode
  | ContextAttachNode;
export type ModuleItem =
  | TagBlockNode
  | TagPrefixNode
  | MacroInvocationNode
  | ProseNode
  | FieldLineNode
  | ServiceNode
  | ModelNode
  | DefDeclNode
  | ModuleConstNode
  | ContextBlockNode
  | ContextAttachNode;

export type ProductItem =
  | TagBlockNode
  | TagPrefixNode
  | MacroInvocationNode
  | ProseNode
  | FieldLineNode
  | ModuleNode
  | AttachModuleNode
  | ContextBlockNode
  | ContextAttachNode;

export interface AttachServiceNode {
  readonly kind: SyntaxNodeKind.AttachService;
  readonly name: string;
  readonly modelSymbol?: string;
  readonly contextSymbols: readonly string[];
  readonly location: SourceLocation;
}

export interface AttachModuleNode {
  readonly kind: SyntaxNodeKind.AttachModule;
  readonly name: string;
  readonly services: readonly AttachServiceNode[];
  readonly location: SourceLocation;
}

export interface ModuleNode {
  readonly kind: SyntaxNodeKind.Module;
  readonly name: string;
  readonly items: readonly ModuleItem[];
  readonly location: SourceLocation;
}

export interface ProductNode {
  readonly kind: SyntaxNodeKind.Product;
  readonly name: string;
  readonly items: readonly ProductItem[];
  readonly location: SourceLocation;
}

export interface ProgramNode {
  readonly kind: SyntaxNodeKind.Workspace;
  readonly version: string;
  readonly imports: readonly ImportNode[];
  readonly exportDefs: readonly DefDeclNode[];
  /** Fragment files: export module … { } at program root. */
  readonly fragmentExports: readonly ModuleNode[];
  /** Fragment files: export service … { } at program root. */
  readonly fragmentServiceExports: readonly ServiceNode[];
  /** Fragment files: export model … { } at program root. */
  readonly fragmentModelExports: readonly ModelNode[];
  /** Fragment files: export context … { } at program root. */
  readonly fragmentContextExports: readonly ContextBlockNode[];
  readonly product?: ProductNode;
  readonly location: SourceLocation;
}

export interface SyntaxTree {
  readonly version: string;
  readonly root: ProgramNode;
  readonly source: string;
  readonly entryFile: string;
}

export function collectLocalDefs(modules: readonly ModuleNode[]): DefDeclNode[] {
  const defs: DefDeclNode[] = [];
  for (const module of modules) {
    for (const item of module.items) {
      if (item.kind === SyntaxNodeKind.DefExport || item.kind === SyntaxNodeKind.DefLocal) {
        defs.push(item);
      }
    }
  }
  return defs;
}

export function programModules(tree: SyntaxTree): readonly ModuleNode[] {
  return tree.root.product?.items.filter((item): item is ModuleNode => item.kind === SyntaxNodeKind.Module) ?? [];
}
