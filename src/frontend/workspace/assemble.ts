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

  // Post-merge: inline topology export bodies into the merged source
  let mergedSource = merged.source;
  if (effectiveRegistry) {
    const topologyPattern = /import\s*\{([^}]+)\}\s+from\s+(@\S+);/g;
    let topoMatch: RegExpExecArray | null = topologyPattern.exec(mergedSource);
    while (topoMatch) {
      const symbolList = topoMatch[1]!;
      const symbols = symbolList.split(",").map((s) => s.trim()).filter(Boolean);
      const inlined: string[] = [];
      for (const sym of symbols) {
        const bare = sym.replace(/^[@#]+/, "");
        const te = effectiveRegistry.structuralExports.get(bare);
        if (te && te.body) {
          inlined.push(`export ${te.kind} ${bare} { ${te.body} }`);
        }
      }
      if (inlined.length > 0) {
        // Replace import line with inlined topology export blocks
        mergedSource = mergedSource.replace(topoMatch[0], inlined.join("\n"));
      }
      topoMatch = topologyPattern.exec(mergedSource);
    }
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
