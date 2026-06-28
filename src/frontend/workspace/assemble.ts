import { FsRegistryLoader } from "../../adapters/fs-registry-loader.js";
import type { EffectiveRegistry } from "../../domain/registry.js";
import { createDiagnostic, DiagnosticCode, type Diagnostic } from "../../domain/index.js";
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

  const assembleDiagnostics: Diagnostic[] = [
    ...(effectiveRegistry?.diagnostics ?? []),
  ];

  // Post-merge: check for bare imports from topology packages → TOPOLOGY_WILDCARD_FORBIDDEN
  if (effectiveRegistry) {
    const bareImportPattern = /^\s*import\s+(@\S+)\s*;/gm;
    let bareMatch: RegExpExecArray | null = bareImportPattern.exec(merged.source);
    while (bareMatch) {
      const coordinate = bareMatch[1]!;
      // If this package has topology exports but no registry defs, it's topology-only
      const hasTopology = [...effectiveRegistry.structuralExports.values()].some(
        (te) => te.source === coordinate,
      );
      const hasRegistry = [...effectiveRegistry.tags.values()].some(
        (t) => t.source === coordinate,
      ) || [...effectiveRegistry.macros.values()].some(
        (m) => m.source === coordinate,
      );
      if (hasTopology && !hasRegistry) {
        throw new Error(
          `TOPOLOGY_WILDCARD_FORBIDDEN: bare import '${bareMatch[0].trim()}' is not allowed for topology packages. Use 'import { symbol } from ${coordinate}' instead.`,
        );
      }
      bareMatch = bareImportPattern.exec(merged.source);
    }

    // PACKAGE_IMPORT_MIXED: consumer imports { *, topologySymbol } from hybrid package
    const mixedImportPattern = /import\s*\{([^}]+)\}\s+from\s+(@\S+);/g;
    let mixedMatch: RegExpExecArray | null = mixedImportPattern.exec(merged.source);
    while (mixedMatch) {
      const symbolList = mixedMatch[1]!;
      const symbols = symbolList.split(",").map((s) => s.trim()).filter(Boolean);
      const hasWildcard = symbols.some((s) => s === "*");
      // Check if any bare (non-sigiled) symbol is a topology export from this coordinate
      const coordinate = mixedMatch[2]!;
      const hasTopologyImport = symbols.some((sym) => {
        if (sym.startsWith("@") || sym.startsWith("#") || sym === "*") return false;
        const te = effectiveRegistry.structuralExports.get(sym);
        return te && te.source === coordinate;
      });
      if (hasWildcard && hasTopologyImport) {
        assembleDiagnostics.push(
          createDiagnostic(
            DiagnosticCode.PackageImportMixed,
            `PACKAGE_IMPORT_MIXED: mixing '*' with topology symbols from '${coordinate}' is discouraged — use separate import lines for registry and topology`,
            { target: coordinate, location: { file: merged.entry, line: 1, col: 1 } },
          ),
        );
      }
      mixedMatch = mixedImportPattern.exec(merged.source);
    }
  }

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
        // Skip sigiled symbols (@, @@, #) and wildcard (*) — those go to registry, not topology
        if (sym.startsWith("@") || sym.startsWith("#") || sym === "*") continue;
        const bare = sym.trim();
        const te = effectiveRegistry.structuralExports.get(bare);
        if (te && te.body) {
          inlined.push(`export ${te.kind} ${bare} { ${te.body} }`);
        } else if (!te) {
          throw new Error(
            `EXPORT_NOT_DECLARED: '${bare}' is not exported by topology package`,
          );
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
      diagnostics: [
        ...(merged.diagnostics ?? []),
        ...assembleDiagnostics,
      ],
    },
    lockfileDigest: resolved.lockfileDigest,
    effectiveRegistry,
    loadedPackages: resolved.loaded,
  };
}
