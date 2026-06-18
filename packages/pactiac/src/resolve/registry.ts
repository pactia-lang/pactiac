import { parse as parseYaml } from "yaml";
import type { LoadedPackage } from "./loader.js";
import { normalizePackageCoordinate } from "./manifest.js";

export enum RegistryMacroTier {
  StdImport = "std-import",
  Import = "import",
  Stack = "stack",
}

export interface RegistryMacroDefinition {
  readonly name: string;
  readonly expandsTo: readonly string[];
  readonly source: string;
  readonly tier: RegistryMacroTier;
}

export interface EffectiveRegistry {
  readonly macros: ReadonlyMap<string, RegistryMacroDefinition>;
}

export enum RegistryErrorCode {
  RegistryCollision = "REGISTRY_COLLISION",
  MacroExpansionCycle = "MACRO_EXPANSION_CYCLE",
}

export class RegistryError extends Error {
  constructor(
    readonly code: RegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMacroEntry(
  entry: unknown,
  source: string,
  tier: RegistryMacroTier,
): RegistryMacroDefinition | undefined {
  if (!isRecord(entry) || typeof entry["name"] !== "string") return undefined;
  const expandsRaw = entry["expands_to"] ?? entry["expandsTo"];
  const expandsTo = Array.isArray(expandsRaw)
    ? expandsRaw.filter((line): line is string => typeof line === "string")
    : [];
  return { name: entry["name"], expandsTo, source, tier };
}

/** Parse `registry.macros[]` or top-level `macros[]` from a package manifest. */
export function parsePackageMacros(
  manifestSource: string | undefined,
  source: string,
  tier: RegistryMacroTier,
): RegistryMacroDefinition[] {
  if (!manifestSource) return [];

  const parsed = parseYaml(manifestSource);
  if (!isRecord(parsed)) return [];

  const registryBlock = isRecord(parsed["registry"]) ? parsed["registry"] : parsed;
  const macrosRaw = registryBlock["macros"];
  if (!Array.isArray(macrosRaw)) return [];

  const macros: RegistryMacroDefinition[] = [];
  for (const entry of macrosRaw) {
    const macro = parseMacroEntry(entry, source, tier);
    if (macro) macros.push(macro);
  }
  return macros;
}

function isStdPackage(coordinate: string): boolean {
  return coordinate.startsWith("@pactia/");
}

export interface BuildEffectiveRegistryInput {
  readonly stackCoordinate: string;
  readonly importCoordinates: readonly string[];
  readonly loaded: readonly LoadedPackage[];
}

function packageByCoordinate(
  loaded: readonly LoadedPackage[],
  coordinate: string,
): LoadedPackage | undefined {
  return loaded.find((pkg) => pkg.coordinate === coordinate);
}

function registerImportTier(
  macros: Map<string, RegistryMacroDefinition>,
  packages: readonly LoadedPackage[],
  tier: RegistryMacroTier,
): void {
  for (const pkg of packages) {
    for (const macro of parsePackageMacros(pkg.manifestSource, pkg.coordinate, tier)) {
      const existing = macros.get(macro.name);
      if (existing && existing.source !== macro.source) {
        throw new RegistryError(
          RegistryErrorCode.RegistryCollision,
          `Macro '${macro.name}' is exported by both '${existing.source}' and '${macro.source}'`,
        );
      }
      macros.set(macro.name, macro);
    }
  }
}

/**
 * Build workspace effectiveRegistry for macros.
 * Precedence (low → high): builtins (implicit) → std imports → other imports → stack package.
 */
export function buildEffectiveRegistry(input: BuildEffectiveRegistryInput): EffectiveRegistry {
  const macros = new Map<string, RegistryMacroDefinition>();
  const stackCoordinate = normalizePackageCoordinate(input.stackCoordinate);

  const importPackages = input.importCoordinates
    .map((coordinate) => packageByCoordinate(input.loaded, normalizePackageCoordinate(coordinate)))
    .filter((pkg): pkg is LoadedPackage => pkg !== undefined)
    .filter((pkg) => pkg.coordinate !== stackCoordinate);

  const stdPackages = importPackages.filter((pkg) => isStdPackage(pkg.coordinate));
  const otherPackages = importPackages.filter((pkg) => !isStdPackage(pkg.coordinate));

  registerImportTier(macros, stdPackages, RegistryMacroTier.StdImport);
  registerImportTier(macros, otherPackages, RegistryMacroTier.Import);

  const stackPackage = packageByCoordinate(input.loaded, stackCoordinate);
  if (stackPackage) {
    for (const macro of parsePackageMacros(
      stackPackage.manifestSource,
      stackPackage.coordinate,
      RegistryMacroTier.Stack,
    )) {
      macros.set(macro.name, macro);
    }
  }

  return { macros };
}
