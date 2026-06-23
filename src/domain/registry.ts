import type { IrFile } from "./ir-file.js";
import type { IrMerge } from "./ir-merge.js";
import type { PlacementTarget } from "./placement.js";

/** Parsed field spec from a `def @` body — required names, modifier flag, open extensions. */
export interface FieldSpec {
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly modifier: boolean;
  readonly openExtension: boolean;
}

/** IR slot metadata attached at package build — read during lower (M5). */
export interface IrSlot {
  readonly file: IrFile;
  readonly path: string;
  readonly merge: IrMerge;
}

export enum RegistryEntryKind {
  Tag = "tag",
  Macro = "macro",
}

export interface RegistryTagEntry {
  readonly kind: RegistryEntryKind.Tag;
  readonly name: string;
  readonly source: string;
  readonly in: readonly PlacementTarget[];
  readonly fields: FieldSpec;
  readonly modifier: boolean;
  readonly ir: IrSlot;
}

import type { TagBodyItem } from "./syntax-tree.js";

/** Parsed macro/tag def body — structured items from the parse pass. */
export interface DefBodyAst {
  readonly lines: readonly string[];
  readonly items: readonly TagBodyItem[];
}

export interface RegistryMacroEntry {
  readonly kind: RegistryEntryKind.Macro;
  readonly name: string;
  readonly source: string;
  readonly in: readonly PlacementTarget[];
  readonly params: readonly string[];
  readonly body: DefBodyAst;
}

export type RegistryEntry = RegistryTagEntry | RegistryMacroEntry;

export interface PackageContextExport {
  readonly name: string;
  readonly coordinate: string;
  readonly pathRaw?: string;
  readonly guidance: readonly string[];
}

/** Resolved symbol table for one compile — imported packages and local defs merged. */
export interface EffectiveRegistry {
  readonly tags: ReadonlyMap<string, RegistryTagEntry>;
  readonly macros: ReadonlyMap<string, RegistryMacroEntry>;
  readonly contexts: ReadonlyMap<string, PackageContextExport>;
}

export enum RegistryPrecedenceTier {
  Local = "local",
  Dependency = "dependency",
  ExplicitImport = "explicit-import",
}

/** Precedence order (low → high): dependency < explicit import; local is lowest. */
export const registryPrecedenceOrder: readonly RegistryPrecedenceTier[] = [
  RegistryPrecedenceTier.Local,
  RegistryPrecedenceTier.Dependency,
  RegistryPrecedenceTier.ExplicitImport,
];

export function isRegistryTagEntry(entry: RegistryEntry): entry is RegistryTagEntry {
  return entry.kind === RegistryEntryKind.Tag;
}

export function isRegistryMacroEntry(entry: RegistryEntry): entry is RegistryMacroEntry {
  return entry.kind === RegistryEntryKind.Macro;
}
