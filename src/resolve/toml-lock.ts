import { PackageErrorCode, PackageResolutionError } from "./errors.js";
import type { PactiaLockManifest } from "./manifest.js";

interface LockPackageDraft {
  name?: string;
  version?: string;
  digest?: string;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function finalizePackage(
  draft: LockPackageDraft,
  index: number,
): PactiaLockManifest["packages"][number] {
  const { name, version, digest } = draft;
  if (typeof name !== "string" || typeof version !== "string" || typeof digest !== "string") {
    throw new PackageResolutionError(
      PackageErrorCode.LockEntryMissing,
      `pactia.lock [[package]] entry ${index} must include name, version, and digest`,
    );
  }
  return { name, version, digest };
}

/** Parse Cargo-style TOML lockfile — spec/docs/packages.md. */
export function parsePactiaLockToml(source: string): PactiaLockManifest {
  const packages: PactiaLockManifest["packages"][number][] = [];
  let lockVersion: number | undefined;
  let current: LockPackageDraft | undefined;
  let packageIndex = 0;

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    if (line === "[[package]]") {
      if (current) {
        packages.push(finalizePackage(current, packageIndex));
        packageIndex += 1;
      }
      current = {};
      continue;
    }

    const kv = /^([^=]+)=\s*(.+)$/.exec(line);
    if (!kv) continue;

    const key = kv[1]!.trim();
    const value = stripQuotes(kv[2]!.trim());

    if (key === "lockVersion") {
      lockVersion = Number(value);
      continue;
    }

    if (!current) continue;
    if (key === "name") current.name = value;
    if (key === "version") current.version = value;
    if (key === "digest") current.digest = value;
  }

  if (current) {
    packages.push(finalizePackage(current, packageIndex));
  }

  if (packages.length === 0) {
    throw new PackageResolutionError(
      PackageErrorCode.LockEntryMissing,
      "pactia.lock must contain at least one [[package]] entry",
    );
  }

  if (lockVersion !== undefined && lockVersion < 1) {
    throw new PackageResolutionError(
      PackageErrorCode.LockEntryMissing,
      "pactia.lock lockVersion must be >= 1",
    );
  }

  return { packages };
}
