import {
  RegistryEntryKind,
  type DefBodyAst,
  type EffectiveRegistry,
  type PackageContextExport,
  type RegistryMacroEntry,
  type RegistryTagEntry,
} from "../../domain/registry.js";
import type { DefDeclNode, ProgramNode, ContextBlockNode } from "../../domain/syntax-tree.js";
import { DefSigil as DefSigilEnum } from "../../domain/syntax-tree.js";
import { fieldSpecFromDefBody } from "../parse/recursive-descent-parser.js";
import { deriveIrSlotForTag } from "./derive-tag-ir.js";
import { extractExportBody } from "./extract-body.js";

function defBodyFromDecl(def: DefDeclNode): DefBodyAst {
  return {
    lines: def.bodySource.split("\n").filter((line) => line.length > 0),
    items: def.bodyItems,
  };
}

function defToRegistryEntries(
  def: DefDeclNode,
  source: string,
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

  const ir = deriveIrSlotForTag(def);

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
): { readonly tags: RegistryTagEntry[]; readonly macros: RegistryMacroEntry[] } {
  const tags: RegistryTagEntry[] = [];
  const macros: RegistryMacroEntry[] = [];

  for (const def of program.exportDefs) {
    const entry = defToRegistryEntries(def, source);
    if (!entry) continue;
    if (entry.kind === RegistryEntryKind.Tag) tags.push(entry);
    else macros.push(entry);
  }

  return { tags, macros };
}

export function constantsFromProgram(
  program: ProgramNode,
): readonly { readonly name: string; readonly value: string }[] {
  return program.constantExports.map((c) => ({
    name: c.name,
    value: c.value,
  }));
}

/** Topology symbol extracted from a vendored topology package. */
export interface TopologyExport {
  readonly kind: "module" | "service" | "model" | "context";
  readonly name: string;
  readonly source: string;
  /** The body text of the export block (empty for now — populated in future pass). */
  readonly body: string;
}

/** Extract topology exports from a parsed index.pactia (topology or mixed profile). */
export function topologyExportsFromProgram(
  program: ProgramNode,
  source: string,
  sourceText?: string,
): readonly TopologyExport[] {
  const exports: TopologyExport[] = [];

  for (const mod of program.fragmentExports) {
    exports.push({ kind: "module", name: mod.name, source, body: extractExportBody(sourceText ?? "", "module", mod.name) });
  }
  for (const svc of program.fragmentServiceExports) {
    exports.push({ kind: "service", name: svc.name, source, body: extractExportBody(sourceText ?? "", "service", svc.name) });
  }
  for (const model of program.fragmentModelExports) {
    const name = model.name ?? "";
    exports.push({ kind: "model", name: name || "unnamed", source, body: extractExportBody(sourceText ?? "", "model", name) });
  }
  for (const ctx of program.fragmentContextExports) {
    exports.push({ kind: "context", name: ctx.name, source, body: extractExportBody(sourceText ?? "", "context", ctx.name) });
  }

  return exports;
}

export function contextExportsFromProgram(
  program: ProgramNode,
  coordinate: string,
): readonly PackageContextExport[] {
  return program.fragmentContextExports.map((ctx) => ({
    name: ctx.name,
    coordinate,
    pathRaw: ctx.pathRaw,
    guidance: ctx.guidance,
  }));
}

export function filterContextExports(
  exports: readonly PackageContextExport[],
  partialSymbols: readonly string[] | undefined,
): PackageContextExport[] {
  if (!partialSymbols || partialSymbols.length === 0) {
    return [...exports];
  }
  const allowed = new Set(
    partialSymbols
      .filter((symbol) => !symbol.startsWith("@") && !symbol.startsWith("#"))
      .map((symbol) => symbol.trim()),
  );
  return exports.filter((entry) => allowed.has(entry.name));
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
      ir: deriveIrSlotForTag(def),
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
    readonly contexts: readonly PackageContextExport[];
    readonly constants: ReadonlyMap<string, string>;
    readonly topologyExports: readonly TopologyExport[];
  }>;
  readonly localTags: readonly RegistryTagEntry[];
  readonly localMacros: readonly RegistryMacroEntry[];
  /** Non-fatal diagnostics collected during registry loading. */
  readonly diagnostics?: readonly import("../../domain/diagnostics.js").Diagnostic[];
}

export function mergeEffectiveRegistry(input: MergeRegistryInput): EffectiveRegistry {
  const tags = new Map<string, RegistryTagEntry>();
  const macros = new Map<string, RegistryMacroEntry>();
  const contexts = new Map<string, PackageContextExport>();
  const constants = new Map<string, string>();

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

  const registerContext = (entry: PackageContextExport): void => {
    const existing = contexts.get(entry.name);
    if (existing && existing.coordinate !== entry.coordinate) {
      throw new Error(
        `REGISTRY_COLLISION: context '${entry.name}' exported by both '${existing.coordinate}' and '${entry.coordinate}'`,
      );
    }
    contexts.set(entry.name, entry);
  };

  for (const pkg of input.importEntries) {
    for (const tag of pkg.tags) registerTag(tag, pkg.coordinate);
    for (const macro of pkg.macros) registerMacro(macro, pkg.coordinate);
    for (const contextExport of pkg.contexts) registerContext(contextExport);
    for (const [name, value] of pkg.constants) {
      const existing = constants.get(name);
      if (existing !== undefined && existing !== value) {
        throw new Error(
          `REGISTRY_COLLISION: constant '${name}' exported with conflicting values '${existing}' and '${value}'`,
        );
      }
      constants.set(name, value);
    }
  }

  for (const tag of input.localTags) registerTag(tag, "local");
  for (const macro of input.localMacros) registerMacro(macro, "local");

  const structuralExports = new Map<string, { readonly kind: string; readonly source: string; readonly body: string }>();

  for (const pkg of input.importEntries) {
    for (const te of pkg.topologyExports) {
      const existing = structuralExports.get(te.name);
      if (existing && existing.source !== te.source) {
        throw new Error(
          `TOPOLOGY_DUPLICATE_SERVICE: topology export '${te.name}' from both '${existing.source}' and '${te.source}'`,
        );
      }
      structuralExports.set(te.name, { kind: te.kind, source: te.source, body: te.body });
    }
  }

  return { tags, macros, contexts, constants, structuralExports, diagnostics: input.diagnostics ?? [] };
}
