import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PackageErrorCode, PackageResolutionError } from "./errors.js";
import type { PactiaLockManifest } from "./manifest.js";

export interface LoadedPackage {
  readonly coordinate: string;
  readonly version: string;
  readonly digest: string;
  readonly rootDir: string;
  readonly manifestSource: string | undefined;
  readonly indexSource: string | undefined;
}

function readOptional(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function vendorSearchRoots(workspaceRoot: string): string[] {
  const roots = [join(workspaceRoot, ".pactia", "packages")];
  if (process.env["PACTIA_VENDOR_ROOT"]) {
    roots.push(resolve(process.env["PACTIA_VENDOR_ROOT"]));
  }
  return roots;
}

function packageDirName(coordinate: string, version: string): string {
  return `${coordinate.replace(/\//g, "--")}@${version}`;
}

export function loadVendoredPackage(
  workspaceRoot: string,
  coordinate: string,
  lockEntry: PactiaLockManifest["packages"][number],
): LoadedPackage {
  for (const vendorRoot of vendorSearchRoots(workspaceRoot)) {
    const dir = join(vendorRoot, packageDirName(coordinate, lockEntry.version));
    if (!existsSync(dir)) continue;

    const manifestPath = join(dir, "pactia.package.json");
    const tarballDigestPath = join(dir, ".digest");
    const onDiskDigest = readOptional(tarballDigestPath);
    if (onDiskDigest && onDiskDigest.trim() !== lockEntry.digest) {
      throw new PackageResolutionError(
        PackageErrorCode.PackageLockMismatch,
        `Digest mismatch for '${coordinate}': lock has ${lockEntry.digest}, vendor has ${onDiskDigest.trim()}`,
      );
    }

    return {
      coordinate,
      version: lockEntry.version,
      digest: lockEntry.digest,
      rootDir: dir,
      manifestSource: readOptional(manifestPath),
      indexSource: readOptional(join(dir, "index.pactia")),
    };
  }

  throw new PackageResolutionError(
    PackageErrorCode.PackageNotFound,
    `Vendored package '${coordinate}@${lockEntry.version}' not found under workspace vendor roots`,
  );
}

export function hashDirectoryMarker(rootDir: string): string {
  const marker = join(rootDir, ".digest");
  if (existsSync(marker)) {
    return readFileSync(marker, "utf8").trim();
  }
  const manifest = readOptional(join(rootDir, "pactia.package.json")) ?? "";
  const hash = createHash("sha256").update(manifest, "utf8").digest("hex");
  return `sha256:${hash}`;
}
