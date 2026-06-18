import { discoverWorkspace } from "./discover.js";
import { mergeWorkspaceSources } from "./merge.js";
import { resolveWorkspacePackages } from "../packages/resolver.js";
import { extractV2Kernel } from "../v2-kernel/extract.js";
import type { MergedWorkspaceSource } from "./types.js";

export interface AssembledWorkspace {
  readonly merged: MergedWorkspaceSource;
  readonly lockfileDigest: string | undefined;
}

export function assembleWorkspace(rootDir: string): AssembledWorkspace {
  const files = discoverWorkspace(rootDir);
  const merged = mergeWorkspaceSources(files);
  const kernel = extractV2Kernel(merged.source);
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
  };
}
