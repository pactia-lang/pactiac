import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { PackageErrorCode, PackageResolutionError } from "./errors.js";

export interface PactiaTomlManifest {
  readonly stackPackage: string | undefined;
  readonly dependencies: ReadonlyMap<string, string>;
}

export interface PactiaLockManifest {
  readonly packages: ReadonlyArray<{
    readonly name: string;
    readonly version: string;
    readonly digest: string;
  }>;
}

export function parsePactiaToml(source: string): PactiaTomlManifest {
  const dependencies = new Map<string, string>();
  let stackPackage: string | undefined;
  let section: "none" | "stack" | "dependencies" = "none";

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    if (line === "[stack]") {
      section = "stack";
      continue;
    }
    if (line === "[dependencies]") {
      section = "dependencies";
      continue;
    }
    if (line.startsWith("[")) {
      section = "none";
      continue;
    }

    const kv = /^([^=]+)=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.trim();
    const value = kv[2]!.trim().replace(/^["']|["']$/g, "");

    if (section === "stack" && key === "package") {
      stackPackage = value;
    } else if (section === "dependencies") {
      dependencies.set(key.replace(/^["']|["']$/g, ""), value);
    }
  }

  return { stackPackage, dependencies };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePactiaLock(source: string): PactiaLockManifest {
  const parsed = parseYaml(source);
  if (!isRecord(parsed) || !Array.isArray(parsed["packages"])) {
    throw new PackageResolutionError(
      PackageErrorCode.LockEntryMissing,
      "pactia.lock must contain a packages array",
    );
  }

  const packages = (parsed["packages"] as unknown[]).map((entry, index) => {
    if (!isRecord(entry)) {
      throw new PackageResolutionError(
        PackageErrorCode.LockEntryMissing,
        `pactia.lock packages[${index}] must be an object`,
      );
    }
    const name = entry["name"];
    const version = entry["version"];
    const digest = entry["digest"];
    if (typeof name !== "string" || typeof version !== "string" || typeof digest !== "string") {
      throw new PackageResolutionError(
        PackageErrorCode.LockEntryMissing,
        `pactia.lock packages[${index}] must include name, version, and digest`,
      );
    }
    return { name, version, digest };
  });

  return { packages };
}

export function lockfileDigest(source: string): string {
  const hash = createHash("sha256").update(source, "utf8").digest("hex");
  return `sha256:${hash}`;
}

export function normalizePackageCoordinate(coordinate: string): string {
  if (coordinate.startsWith("@")) return coordinate;
  return `@pactia/${coordinate}`;
}

export function resolveStackCoordinate(stackTagTarget: string): string {
  return normalizePackageCoordinate(stackTagTarget);
}

export function assertImportsDeclared(
  imports: readonly string[],
  manifest: PactiaTomlManifest,
): void {
  for (const imp of imports) {
    if (!manifest.dependencies.has(imp)) {
      throw new PackageResolutionError(
        PackageErrorCode.DependencyNotDeclared,
        `Import '${imp}' is not declared in pactia.toml [dependencies]`,
      );
    }
  }
}

export function assertStackBinding(
  stackTagTarget: string,
  manifest: PactiaTomlManifest,
): string {
  const coordinate = resolveStackCoordinate(stackTagTarget);
  if (!manifest.stackPackage) {
    throw new PackageResolutionError(
      PackageErrorCode.StackBindingMismatch,
      `pactia.toml [stack].package is missing but product declares @stack ${stackTagTarget}`,
    );
  }
  if (manifest.stackPackage !== coordinate) {
    throw new PackageResolutionError(
      PackageErrorCode.StackBindingMismatch,
      `@stack ${stackTagTarget} resolves to '${coordinate}' but pactia.toml [stack].package is '${manifest.stackPackage}'`,
    );
  }
  if (!manifest.dependencies.has(coordinate)) {
    throw new PackageResolutionError(
      PackageErrorCode.DependencyNotDeclared,
      `Stack package '${coordinate}' is not declared in pactia.toml [dependencies]`,
    );
  }
  return coordinate;
}

export function assertLockEntries(
  coordinates: readonly string[],
  lock: PactiaLockManifest,
): void {
  for (const coordinate of coordinates) {
    const entry = lock.packages.find((pkg) => pkg.name === coordinate);
    if (!entry) {
      throw new PackageResolutionError(
        PackageErrorCode.LockEntryMissing,
        `No lock entry for '${coordinate}' in pactia.lock`,
      );
    }
  }
}
