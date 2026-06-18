import type { WorkspaceFiles } from "../frontend/workspace/types.js";
import { loadVendoredPackage, type LoadedPackage } from "./loader.js";
import {
  assertImportsDeclared,
  assertLockEntries,
  assertStackBinding,
  lockfileDigest,
  parsePactiaLock,
  parsePactiaToml,
} from "./manifest.js";
import { buildEffectiveRegistry, type EffectiveRegistry } from "./registry.js";

export interface ResolvedWorkspacePackages {
  readonly lockfileDigest: string | undefined;
  readonly loaded: readonly LoadedPackage[];
  readonly effectiveRegistry: EffectiveRegistry | undefined;
}

export function resolveWorkspacePackages(
  files: WorkspaceFiles,
  imports: readonly string[],
  stackTagTarget: string,
): ResolvedWorkspacePackages {
  if (!files.pactiaTomlSource || !files.pactiaLockSource) {
    return { lockfileDigest: undefined, loaded: [], effectiveRegistry: undefined };
  }

  const toml = parsePactiaToml(files.pactiaTomlSource);
  const lock = parsePactiaLock(files.pactiaLockSource);

  assertImportsDeclared(imports, toml);
  const stackCoordinate = assertStackBinding(stackTagTarget, toml);

  const coordinates = [...new Set([...imports, stackCoordinate])];
  assertLockEntries(coordinates, lock);

  const loaded = coordinates.map((coordinate) => {
    const entry = lock.packages.find((pkg) => pkg.name === coordinate)!;
    return loadVendoredPackage(files.rootDir, coordinate, entry);
  });

  return {
    lockfileDigest: lockfileDigest(files.pactiaLockSource),
    loaded,
    effectiveRegistry: buildEffectiveRegistry({
      stackCoordinate,
      importCoordinates: imports,
      loaded,
    }),
  };
}
