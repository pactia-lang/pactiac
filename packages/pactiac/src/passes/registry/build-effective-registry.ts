import { IrFile, parseIrFile } from "../../domain/ir-file.js";
import { IrMerge, parseIrMerge } from "../../domain/ir-merge.js";
import {
  RegistryEntryKind,
  type DefBodyAst,
  type EffectiveRegistry,
  type IrSlot,
  type RegistryMacroEntry,
  type RegistryTagEntry,
} from "../../domain/registry.js";
import type { DefDeclNode, ProgramNode } from "../../domain/syntax-tree.js";
import { DefSigil as DefSigilEnum } from "../../domain/syntax-tree.js";
import { parsePackageManifest, registryBlockFromManifest } from "../../resolve/package-manifest.js";
import { fieldSpecFromDefBody } from "../parse/recursive-descent-parser.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function manifestTagIr(
  manifestSource: string | undefined,
  tagName: string,
): IrSlot | undefined {
  if (!manifestSource) return undefined;
  try {
    const manifest = parsePackageManifest(manifestSource);
    const registry = registryBlockFromManifest(manifest);
    const tags = registry["tags"];
    if (!Array.isArray(tags)) return undefined;
    for (const entry of tags) {
      if (!isRecord(entry) || entry["name"] !== tagName) continue;
      const ir = entry["ir"];
      if (!isRecord(ir)) return undefined;
      const file = parseIrFile(String(ir["file"] ?? ""));
      const merge = parseIrMerge(String(ir["merge"] ?? ""));
      const path = ir["path"];
      if (!file || !merge || typeof path !== "string") return undefined;
      return { file, path, merge };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function defBodyFromDecl(def: DefDeclNode): DefBodyAst {
  return {
    lines: def.bodySource.split("\n").filter((line) => line.length > 0),
    items: def.bodyItems,
  };
}

function defToRegistryEntries(
  def: DefDeclNode,
  source: string,
  manifestSource: string | undefined,
): RegistryTagEntry | RegistryMacroEntry | undefined {
  const body = defBodyFromDecl(def);

  if (def.sigil === DefSigilEnum.Macro) {
    return {
      kind: RegistryEntryKind.Macro,
      name: def.name,
      source,
      in: def.inTargets,
      params: def.params,
      body,
    };
  }

  const ir = manifestTagIr(manifestSource, def.name);
  if (!ir) return undefined;

  return {
    kind: RegistryEntryKind.Tag,
    name: def.name,
    source,
    in: def.inTargets,
    fields: fieldSpecFromDefBody(def.bodyItems),
    modifier: def.modifier,
    ir,
  };
}

export function registryEntriesFromProgram(
  program: ProgramNode,
  source: string,
  manifestSource?: string,
): { readonly tags: RegistryTagEntry[]; readonly macros: RegistryMacroEntry[] } {
  const tags: RegistryTagEntry[] = [];
  const macros: RegistryMacroEntry[] = [];

  for (const def of program.exportDefs) {
    const entry = defToRegistryEntries(def, source, manifestSource);
    if (!entry) continue;
    if (entry.kind === RegistryEntryKind.Tag) tags.push(entry);
    else macros.push(entry);
  }

  return { tags, macros };
}

export function registryEntriesFromLocalDefs(
  defs: readonly DefDeclNode[],
  source: string,
): { readonly tags: RegistryTagEntry[]; readonly macros: RegistryMacroEntry[] } {
  const tags: RegistryTagEntry[] = [];
  const macros: RegistryMacroEntry[] = [];

  for (const def of defs) {
    if (def.exported) continue;
    const body = defBodyFromDecl(def);
    if (def.sigil === DefSigilEnum.Macro) {
      macros.push({
        kind: RegistryEntryKind.Macro,
        name: def.name,
        source,
        in: def.inTargets,
        params: def.params,
        body,
      });
      continue;
    }
    tags.push({
      kind: RegistryEntryKind.Tag,
      name: def.name,
      source,
      in: def.inTargets,
      fields: fieldSpecFromDefBody(def.bodyItems),
      modifier: def.modifier,
      ir: { file: IrFile.Service, path: "extensions[]", merge: IrMerge.MergeFields },
    });
  }

  return { tags, macros };
}

export interface MergeRegistryInput {
  readonly importEntries: ReadonlyArray<{
    readonly coordinate: string;
    readonly tier: import("../../domain/registry.js").RegistryPrecedenceTier;
    readonly tags: readonly RegistryTagEntry[];
    readonly macros: readonly RegistryMacroEntry[];
  }>;
  readonly localTags: readonly RegistryTagEntry[];
  readonly localMacros: readonly RegistryMacroEntry[];
}

export function mergeEffectiveRegistry(input: MergeRegistryInput): EffectiveRegistry {
  const tags = new Map<string, RegistryTagEntry>();
  const macros = new Map<string, RegistryMacroEntry>();

  const registerTag = (entry: RegistryTagEntry, tierLabel: string): void => {
    const existing = tags.get(entry.name);
    if (existing && existing.source !== entry.source) {
      throw new Error(
        `REGISTRY_COLLISION: '${entry.name}' exported by both '${existing.source}' and '${entry.source}' (${tierLabel})`,
      );
    }
    tags.set(entry.name, entry);
  };

  const registerMacro = (entry: RegistryMacroEntry, tierLabel: string): void => {
    const existing = macros.get(entry.name);
    if (existing && existing.source !== entry.source) {
      throw new Error(
        `REGISTRY_COLLISION: '${entry.name}' exported by both '${existing.source}' and '${entry.source}' (${tierLabel})`,
      );
    }
    macros.set(entry.name, entry);
  };

  for (const pkg of input.importEntries) {
    for (const tag of pkg.tags) registerTag(tag, pkg.coordinate);
    for (const macro of pkg.macros) registerMacro(macro, pkg.coordinate);
  }

  for (const tag of input.localTags) registerTag(tag, "local");
  for (const macro of input.localMacros) registerMacro(macro, "local");

  return { tags, macros };
}
