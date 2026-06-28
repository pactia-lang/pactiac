import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  RegistryPrecedenceTier,
  registryPrecedenceOrder,
  type EffectiveRegistry,
} from "../domain/registry.js";
import { collectLocalDefs, programModules, type SyntaxTree } from "../domain/syntax-tree.js";
import type { RegistryLoaderInput, RegistryLoaderSync } from "../ports/registry-loader.js";
import { loadVendoredPackage, type LoadedPackage } from "../resolve/loader.js";
import { PackageErrorCode, PackageResolutionError } from "../resolve/errors.js";
import {
  assertImportsDeclared,
  assertLockEntries,
  parsePactiaLock,
  parsePactiaToml,
} from "../resolve/manifest.js";
import { parseSyntaxTree } from "../passes/parse/recursive-descent-parser.js";
import {
  constantsFromProgram,
  mergeEffectiveRegistry,
  registryEntriesFromLocalDefs,
  registryEntriesFromProgram,
  contextExportsFromProgram,
  filterContextExports,
  topologyExportsFromProgram,
} from "../passes/registry/build-effective-registry.js";
import { applyPartialImportFilter } from "../passes/registry/import-symbol.js";
import { detectPackageProfile, PackageProfile } from "../domain/syntax-tree.js";
import { parsePackageToml } from "../resolve/package-toml.js";
import { createDiagnostic, DiagnosticCode, type Diagnostic } from "../domain/index.js";

const INDEX_FILE = "index.pactia";
const TOML_FILE = "pactia.toml";
const LOCK_FILE = "pactia.lock";

function readOptional(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function tierRank(tier: RegistryPrecedenceTier): number {
  return registryPrecedenceOrder.indexOf(tier);
}

export class FsRegistryLoader implements RegistryLoaderSync {
  load(input: RegistryLoaderInput): EffectiveRegistry {
    const tomlSource = readOptional(join(input.workspaceRoot, TOML_FILE));
    const lockSource = readOptional(join(input.workspaceRoot, LOCK_FILE));
    const imports = input.importCoordinates;

    const importPackages: LoadedPackage[] = [];

    if (tomlSource && lockSource) {
      const toml = parsePactiaToml(tomlSource);
      const lock = parsePactiaLock(lockSource);
      assertImportsDeclared(imports, toml);

      const coordinates = [...new Set(imports)];
      assertLockEntries(coordinates, lock);

      for (const coordinate of coordinates) {
        const entry = lock.packages.find((pkg) => pkg.name === coordinate)!;
        importPackages.push(loadVendoredPackage(input.workspaceRoot, coordinate, entry));
      }
    }

    const loaderDiagnostics: Diagnostic[] = [];

    const importEntries = importPackages.map((pkg) => {
      const indexSource = readOptional(join(pkg.rootDir, INDEX_FILE));
      const program = indexSource
        ? parseSyntaxTree({ source: indexSource, entryFile: INDEX_FILE }).root
        : undefined;
      const parsed = program
        ? registryEntriesFromProgram(program, pkg.coordinate)
        : { tags: [], macros: [] };

      const partialSymbols = input.macroExpansion
        ? undefined
        : input.partialImports?.get(pkg.coordinate);
      const filtered = applyPartialImportFilter(parsed.tags, parsed.macros, partialSymbols);
      const contextExports = filterContextExports(
        program ? contextExportsFromProgram(program, pkg.coordinate) : [],
        partialSymbols,
      );

      const tier = imports.includes(pkg.coordinate)
        ? RegistryPrecedenceTier.ExplicitImport
        : RegistryPrecedenceTier.Dependency;

      const allConstants = program
        ? constantsFromProgram(program)
        : [];

      // Load topology exports from manifest files for topology/mixed packages
      let topologyExports: ReturnType<typeof topologyExportsFromProgram> = [];
      if (program) {
        const profile = detectPackageProfile(program);

        // PACKAGE_PROFILE_MISMATCH: declared exports field in pactia.toml doesn't match index.pactia
        if (pkg.manifestSource) {
          const pkgToml = parsePackageToml(pkg.manifestSource);
          if (pkgToml.exports === "topology" && profile === PackageProfile.Registry) {
            throw new PackageResolutionError(
              PackageErrorCode.PackageLockMismatch,
              `PACKAGE_PROFILE_MISMATCH: '${pkg.coordinate}' declares exports = "topology" but index.pactia contains only registry exports`,
            );
          }
          if (pkgToml.exports === "registry" && profile === PackageProfile.Topology) {
            throw new PackageResolutionError(
              PackageErrorCode.PackageLockMismatch,
              `PACKAGE_PROFILE_MISMATCH: '${pkg.coordinate}' declares exports = "registry" but index.pactia contains only topology exports`,
            );
          }
        }

        if (profile === PackageProfile.Mixed) {
          // Mixed profile requires mixed-exports = true opt-in
          if (pkg.manifestSource) {
            const pkgToml = parsePackageToml(pkg.manifestSource);
            if (!pkgToml.mixedExports) {
              throw new PackageResolutionError(
                PackageErrorCode.PackageLockMismatch,
                `PACKAGE_EXPORT_MIXED: '${pkg.coordinate}' has both registry and topology exports but missing 'mixed-exports = true' in pactia.toml [package]`,
              );
            }
            // HYBRID_PACKAGE_DISCOURAGED: mixed-exports = true is an escape hatch, not preferred
            loaderDiagnostics.push(
              createDiagnostic(
                DiagnosticCode.HybridPackageDiscouraged,
                `HYBRID_PACKAGE_DISCOURAGED: '${pkg.coordinate}' uses mixed-exports = true — prefer splitting into separate registry and topology packages`,
                {
                  target: pkg.coordinate,
                  location: { file: join(pkg.rootDir, TOML_FILE), line: 1, col: 1 },
                },
              ),
            );
          }
        }
        if (profile === PackageProfile.Topology || profile === PackageProfile.Mixed) {
          // Load and parse each manifest-referenced file
          for (const manifestPath of program.manifestExports) {
            const fullPath = join(pkg.rootDir, manifestPath);
            if (!existsSync(fullPath)) {
              throw new PackageResolutionError(
                PackageErrorCode.PackageLockMismatch,
                `TOPOLOGY_EXPORT_FILE_MISSING: manifest file '${manifestPath}' referenced in '${pkg.coordinate}' index.pactia does not exist`,
              );
            }
            const fileSource = readFileSync(fullPath, "utf8");
            try {
              const fileProgram = parseSyntaxTree({ source: fileSource, entryFile: manifestPath }).root;
              topologyExports = topologyExports.concat(
                topologyExportsFromProgram(fileProgram, pkg.coordinate, fileSource),
              );
            } catch {
              // Skip unparseable manifest files
            }
          }
          // Also include inline topology exports from index.pactia itself
          topologyExports = topologyExports.concat(
            topologyExportsFromProgram(program, pkg.coordinate, indexSource),
          );
        }
      }

      return {
        coordinate: pkg.coordinate,
        tier,
        tags: filtered.tags,
        macros: filtered.macros,
        contexts: contextExports,
        constants: new Map(
          (partialSymbols
            ? allConstants.filter((c) => partialSymbols.includes(c.name))
            : allConstants
          ).map((c) => [c.name, c.value] as const),
        ),
        topologyExports,
      };
    });

    importEntries.sort((left, right) => tierRank(left.tier) - tierRank(right.tier));

    const localDefs = input.syntax ? collectLocalDefs(programModules(input.syntax)) : [];
    const local = registryEntriesFromLocalDefs(localDefs, "local");

    return mergeEffectiveRegistry({
      importEntries,
      localTags: local.tags,
      localMacros: local.macros,
      diagnostics: loaderDiagnostics,
    });
  }
}

export function loadRegistryFromWorkspace(
  workspaceRoot: string,
  syntax: SyntaxTree,
): EffectiveRegistry {
  const imports = syntax.root.imports
    .map((node) => node.path)
    .filter((path) => path.startsWith("@"));
  const partialImports = new Map<string, readonly string[]>();
  for (const node of syntax.root.imports) {
    if (node.path.startsWith("@") && node.symbols && node.symbols.length > 0) {
      partialImports.set(node.path, node.symbols);
    }
  }
  return new FsRegistryLoader().load({
    workspaceRoot: resolve(workspaceRoot),
    importCoordinates: imports,
    syntax,
    partialImports,
  });
}
