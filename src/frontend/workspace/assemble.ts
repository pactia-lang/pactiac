import { FsRegistryLoader } from "../../adapters/fs-registry-loader.js";
import type { EffectiveRegistry } from "../../domain/registry.js";
import { parseSyntaxTree } from "../../passes/parse/recursive-descent-parser.js";
import type { LoadedPackage } from "../../resolve/loader.js";
import { resolveWorkspacePackages } from "../../resolve/resolver.js";
import { discoverWorkspace } from "./discover.js";
import { mergeWorkspaceSources } from "./merge.js";
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
  const syntax = parseSyntaxTree({ source: merged.source, entryFile: merged.entry });
  const imports = syntax.root.imports
    .map((node) => node.path)
    .filter((path) => path.startsWith("@"));
  const resolved = resolveWorkspacePackages(files, imports);

  const effectiveRegistry = new FsRegistryLoader().load({
    workspaceRoot: rootDir,
    importCoordinates: imports,
    syntax,
  });

  return {
    merged: {
      ...merged,
      lockfileDigest: resolved.lockfileDigest,
    },
    lockfileDigest: resolved.lockfileDigest,
    effectiveRegistry,
    loadedPackages: resolved.loaded,
  };
}
