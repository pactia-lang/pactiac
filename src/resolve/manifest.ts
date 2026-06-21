import { createHash } from "node:crypto";
import { parsePactiaLockToml } from "./toml-lock.js";
import { PackageErrorCode, PackageResolutionError } from "./errors.js";

export interface PactiaTomlManifest {
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
  let section: "none" | "dependencies" = "none";

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

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

    if (section === "dependencies") {
      dependencies.set(key.replace(/^["']|["']$/g, ""), value);
    }
  }

  return { dependencies };
}

export function parsePactiaLock(source: string): PactiaLockManifest {
  return parsePactiaLockToml(source);
}

export function lockfileDigest(source: string): string {
  const hash = createHash("sha256").update(source, "utf8").digest("hex");
  return `sha256:${hash}`;
}

export function normalizePackageCoordinate(coordinate: string): string {
  if (coordinate.startsWith("@")) return coordinate;
  return `@pactia/${coordinate}`;
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
