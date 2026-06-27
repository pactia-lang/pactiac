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

  // Post-merge: inline topology exports from structuralExports into merged source
  let mergedSource = merged.source;
  const topologyPattern = /import\s*\{([^}]+)\}\s+from\s+(@\S+);/g;
  let topoMatch: RegExpExecArray | null = topologyPattern.exec(mergedSource);
  while (topoMatch) {
    const symbolList = topoMatch[1]!;
    const coordinate = topoMatch[2]!;
    const symbols = symbolList.split(",").map((s) => s.trim()).filter(Boolean);
    let hasTopologySymbol = false;
    for (const sym of symbols) {
      const bare = sym.replace(/^[@#]+/, "");
      if (effectiveRegistry.structuralExports.has(bare)) {
        hasTopologySymbol = true;
      }
    }
    if (hasTopologySymbol) {
      // Remove this import line — topology symbols are resolved via structuralExports at attach time
      mergedSource = mergedSource.replace(topoMatch[0], "");
    }
    topoMatch = topologyPattern.exec(mergedSource);
  }

  return {
    merged: {
      ...merged,
      source: mergedSource,
      lockfileDigest: resolved.lockfileDigest,
    },
    lockfileDigest: resolved.lockfileDigest,
    effectiveRegistry,
    loadedPackages: resolved.loaded,
  };
}
