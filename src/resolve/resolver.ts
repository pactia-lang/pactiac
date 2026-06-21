import type { WorkspaceFiles } from "../frontend/workspace/types.js";
import { loadVendoredPackage, type LoadedPackage } from "./loader.js";
import {
  assertImportsDeclared,
  assertLockEntries,
  lockfileDigest,
  parsePactiaLock,
  parsePactiaToml,
} from "./manifest.js";
export interface ResolvedWorkspacePackages {
  readonly lockfileDigest: string | undefined;
  readonly loaded: readonly LoadedPackage[];
}

export function resolveWorkspacePackages(
  files: WorkspaceFiles,
  imports: readonly string[],
): ResolvedWorkspacePackages {
  if (!files.pactiaTomlSource || !files.pactiaLockSource) {
    return { lockfileDigest: undefined, loaded: [] };
  }

  const toml = parsePactiaToml(files.pactiaTomlSource);
  const lock = parsePactiaLock(files.pactiaLockSource);

  assertImportsDeclared(imports, toml);

  const coordinates = [...new Set(imports)];
  assertLockEntries(coordinates, lock);

  const loaded = coordinates.map((coordinate) => {
    const entry = lock.packages.find((pkg) => pkg.name === coordinate)!;
    return loadVendoredPackage(files.rootDir, coordinate, entry);
  });

  return {
    lockfileDigest: lockfileDigest(files.pactiaLockSource),
    loaded,
  };
}
