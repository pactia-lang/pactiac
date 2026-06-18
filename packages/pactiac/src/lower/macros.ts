import { IdempotencyMode } from "@pactia/schema";

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

export function isBuiltinMacro(name: string): boolean {
  return BUILTIN_MACRO_NAMES.has(parseMacroName(name));
}

export function expandEndpointMacros(macros: readonly string[]): MacroExpansionResult {
  const modifiers: Record<string, unknown> = {};
  const unknownMacros: string[] = [];

  for (const raw of macros) {
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
  }

  return { modifiers, unknownMacros };
}
