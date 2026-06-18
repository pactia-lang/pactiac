import { IdempotencyMode } from "@pactia/schema";
import {
  RegistryError,
  RegistryErrorCode,
  type EffectiveRegistry,
} from "../resolve/registry.js";

/** Built-in endpoint macros (lowest registry precedence). */
export enum BuiltinMacro {
  List = "list",
  Paginated = "paginated",
  Detail = "detail",
  History = "history",
  Create = "create",
  Owner = "owner",
  Buyer = "buyer",
  Seller = "seller",
  Participant = "participant",
  Idempotent = "idempotent",
  RateLimit = "rate_limit",
}

const BUILTIN_MACRO_NAMES = new Set<string>(Object.values(BuiltinMacro));

const NESTED_MACRO_PATTERN = /^#\[\s*([\w(.,\s\d]+)\s*\]/;
const IR_MODIFIER_ASSIGNMENT = /^modifiers\.(\w+):\s*(.+)$/;

export interface MacroExpansionResult {
  readonly modifiers: Record<string, unknown>;
  readonly unknownMacros: readonly string[];
}

export function parseMacroName(raw: string): string {
  const match = /^([\w]+)/.exec(raw.trim());
  return match?.[1] ?? raw.trim();
}

function parseRateLimitArgs(raw: string): Record<string, unknown> | undefined {
  const argsMatch = /\(([^)]+)\)/.exec(raw);
  if (!argsMatch) return undefined;
  const parts = argsMatch[1]!.split(",").map((part) => part.trim());
  const limit = Number.parseInt(parts[0] ?? "", 10);
  const unit = parts[1];
  if (!Number.isFinite(limit)) return undefined;
  return { limit, ...(unit ? { unit } : {}) };
}

function parseIrModifierAssignment(line: string): Record<string, unknown> | undefined {
  const match = IR_MODIFIER_ASSIGNMENT.exec(line.trim());
  if (!match) return undefined;
  const key = match[1]!;
  const rawValue = match[2]!.trim();
  if (rawValue === "true") return { [key]: true };
  if (rawValue === "false") return { [key]: false };
  const numeric = Number(rawValue);
  if (Number.isFinite(numeric)) return { [key]: numeric };
  return { [key]: rawValue.replace(/^["']|["']$/g, "") };
}

export function isBuiltinMacro(name: string): boolean {
  return BUILTIN_MACRO_NAMES.has(parseMacroName(name));
}

function expandSingleBuiltin(raw: string): MacroExpansionResult {
  const modifiers: Record<string, unknown> = {};
  const unknownMacros: string[] = [];
  const name = parseMacroName(raw);

  switch (name) {
    case BuiltinMacro.List:
      modifiers["list"] = true;
      break;
    case BuiltinMacro.Paginated:
      modifiers["paginated"] = true;
      break;
    case BuiltinMacro.Detail:
      modifiers["detail"] = true;
      break;
    case BuiltinMacro.History:
      modifiers["history"] = true;
      break;
    case BuiltinMacro.Create:
      modifiers["create"] = true;
      break;
    case BuiltinMacro.Idempotent:
      modifiers["idempotency"] = IdempotencyMode.REQUIRED;
      break;
    case BuiltinMacro.Owner:
    case BuiltinMacro.Buyer:
    case BuiltinMacro.Seller:
    case BuiltinMacro.Participant:
      break;
    case BuiltinMacro.RateLimit: {
      const rateLimit = parseRateLimitArgs(raw);
      if (rateLimit) modifiers["rateLimit"] = rateLimit;
      break;
    }
    default:
      unknownMacros.push(raw);
  }

  return { modifiers, unknownMacros };
}

interface FlattenedRegistryMacro {
  readonly names: string[];
  readonly irModifiers: Record<string, unknown>;
}

function flattenRegistryMacro(
  name: string,
  registry: EffectiveRegistry,
  visiting: Set<string>,
): FlattenedRegistryMacro {
  const definition = registry.macros.get(name);
  if (!definition) {
    return { names: [name], irModifiers: {} };
  }

  if (visiting.has(name)) {
    throw new RegistryError(
      RegistryErrorCode.MacroExpansionCycle,
      `Macro expansion cycle detected at '${name}'`,
    );
  }

  visiting.add(name);
  const names: string[] = [];
  const irModifiers: Record<string, unknown> = {};

  for (const line of definition.expandsTo) {
    const nested = NESTED_MACRO_PATTERN.exec(line.trim());
    if (nested) {
      const nestedName = parseMacroName(nested[1]!);
      const sub = flattenRegistryMacro(nestedName, registry, visiting);
      names.push(...sub.names);
      Object.assign(irModifiers, sub.irModifiers);
      continue;
    }

    const assignment = parseIrModifierAssignment(line);
    if (assignment) {
      Object.assign(irModifiers, assignment);
    }
  }

  visiting.delete(name);
  return { names, irModifiers };
}

export function expandEndpointMacros(
  macros: readonly string[],
  registry?: EffectiveRegistry,
): MacroExpansionResult {
  const modifiers: Record<string, unknown> = {};
  const unknownMacros: string[] = [];

  for (const raw of macros) {
    const name = parseMacroName(raw);
    let builtinNames: string[];

    if (registry?.macros.has(name)) {
      const flattened = flattenRegistryMacro(name, registry, new Set());
      builtinNames = flattened.names;
      Object.assign(modifiers, flattened.irModifiers);
    } else {
      builtinNames = [name];
    }

    for (const builtinName of builtinNames) {
      const source = builtinName === name ? raw : builtinName;
      const single = expandSingleBuiltin(source);
      Object.assign(modifiers, single.modifiers);
      unknownMacros.push(...single.unknownMacros);
    }
  }

  return { modifiers, unknownMacros };
}
