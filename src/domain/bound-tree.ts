import type { PlacementTarget } from "./placement.js";
import type { RegistryEntry, RegistryMacroEntry, RegistryTagEntry } from "./registry.js";
import type {
  ContextBlockNode,
  FieldLineNode,
  ModuleConstNode,
  ProseNode,
  SourceLocation,
} from "./syntax-tree.js";

export interface LocatedNode {
  readonly location: SourceLocation;
}

/** L1 items — bound nodes plus unannotated L0 leaves carried through bind. */
export type BoundTreeItem =
  | BoundNode
  | FieldLineNode
  | ProseNode
  | ModuleConstNode
  | ContextBlockNode;

/** L1 bound tree — L0 nodes annotated with resolved registry entries. */
export enum BoundNodeKind {
  BoundTag = "bound-tag",
  BoundMacro = "bound-macro",
  BoundBlock = "bound-block",
  BoundDef = "bound-def",
  BoundContext = "bound-context",
}

export interface BoundContextNode extends LocatedNode {
  readonly kind: BoundNodeKind.BoundContext;
  readonly name: string;
  readonly path: string | readonly string[];
  readonly guidance: readonly string[];
  /** Set when path is relative to a vendored package root. */
  readonly packageCoordinate?: string;
}

export interface BoundTagNode extends LocatedNode {
  readonly kind: BoundNodeKind.BoundTag;
  readonly tagName: string;
  readonly hostId?: string;
  readonly shorthand?: string;
  readonly registryEntry: RegistryTagEntry;
  readonly enclosing: PlacementTarget;
  readonly children: readonly BoundTreeItem[];
}

export interface BoundMacroNode extends LocatedNode {
  readonly kind: BoundNodeKind.BoundMacro;
  readonly name: string;
  readonly registryEntry: RegistryMacroEntry;
  readonly enclosing: PlacementTarget;
  readonly args: readonly string[];
}

export interface BoundBlockNode extends LocatedNode {
  readonly kind: BoundNodeKind.BoundBlock;
  readonly placement: PlacementTarget;
  readonly hostName?: string;
  readonly children: readonly BoundTreeItem[];
}

export interface BoundDefNode extends LocatedNode {
  readonly kind: BoundNodeKind.BoundDef;
  readonly name: string;
  readonly exported: boolean;
  readonly registryEntry: RegistryEntry;
}

export type BoundNode = BoundTagNode | BoundMacroNode | BoundBlockNode | BoundDefNode | BoundContextNode;

export interface BoundTree {
  readonly entryFile: string;
  readonly root: BoundBlockNode;
}

export function boundNodeLocation(node: BoundNode): SourceLocation {
  return node.location;
}
