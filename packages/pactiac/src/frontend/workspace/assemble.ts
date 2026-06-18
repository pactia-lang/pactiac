import { discoverWorkspace } from "./discover.js";
import { mergeWorkspaceSources } from "./merge.js";
import { resolveWorkspacePackages } from "../../resolve/resolver.js";
import type { LoadedPackage } from "../../resolve/loader.js";
import type { EffectiveRegistry } from "../../resolve/registry.js";
import { extractKernel } from "../kernel/extract.js";
import type { MergedWorkspaceSource } from "./types.js";

export interface AssembledWorkspace {
  readonly merged: MergedWorkspaceSource;
  readonly lockfileDigest: string | undefined;
  readonly effectiveRegistry: EffectiveRegistry | undefined;
  readonly loadedPackages: readonly LoadedPackage[];
}

export function assembleWorkspace(rootDir: string): AssembledWorkspace {
  const files = discoverWorkspace(rootDir);
  const merged = mergeWorkspaceSources(files);
  const kernel = extractKernel(merged.source);
  const resolved = resolveWorkspacePackages(
    files,
    kernel.imports,
    kernel.product.stackPackage,
  );

  return {
    merged: {
      ...merged,
      lockfileDigest: resolved.lockfileDigest,
    },
    lockfileDigest: resolved.lockfileDigest,
    effectiveRegistry: resolved.effectiveRegistry,
    loadedPackages: resolved.loaded,
  };
}
