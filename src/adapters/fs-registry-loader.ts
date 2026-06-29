import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  RegistryPrecedenceTier,
  registryPrecedenceOrder,
  type EffectiveRegistry,
  type RegistryMacroEntry,
  type RegistryTagEntry,
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

function resolveVendorDir(
  workspaceRoot: string,
  coordinate: string,
  version: string,
): string | undefined {
  const pkgDirName = `${coordinate.replace(/\//g, "--")}@${version}`;
  const roots = [join(workspaceRoot, ".pactia", "packages")];
  if (process.env["PACTIA_VENDOR_ROOT"]) {
    roots.push(resolve(process.env["PACTIA_VENDOR_ROOT"]));
  }
  for (const root of roots) {
    const dir = join(root, pkgDirName);
    if (existsSync(dir)) return dir;
  }
  return undefined;
}

function tierRank(tier: RegistryPrecedenceTier): number {
  return registryPrecedenceOrder.indexOf(tier);
}

export class FsRegistryLoader implements RegistryLoaderSync {
  load(input: RegistryLoaderInput): EffectiveRegistry {
    const tomlSource = readOptional(join(input.workspaceRoot, TOML_FILE));
    const lockSource = readOptional(join(input.workspaceRoot, LOCK_FILE));
    const imports = input.importCoordinates;

    const loaderDiagnostics: Diagnostic[] = [];
    const importPackages: LoadedPackage[] = [];
    let transitiveExplicit: Set<string> = new Set();

    if (tomlSource && lockSource) {
      const toml = parsePactiaToml(tomlSource);
      const lock = parsePactiaLock(lockSource);
      assertImportsDeclared(imports, toml);

      // Start with consumer's explicit imports, then discover transitive deps
      const coordinates = [...new Set(imports)];
      transitiveExplicit = new Set<string>();
      const visited = new Set(coordinates);

      // BFS: for each imported package, check its index.pactia for import lines
      const queue = [...coordinates];
      while (queue.length > 0) {
        const coord = queue.shift()!;
        const lockEntry = lock.packages.find((pkg) => pkg.name === coord);
        if (!lockEntry) continue;

        // Load just enough to read the index.pactia (don't add to importPackages yet)
        const pkgDir = resolveVendorDir(input.workspaceRoot, coord, lockEntry.version);
        if (!pkgDir) continue;
        const indexSrc = readOptional(join(pkgDir, INDEX_FILE));
        if (!indexSrc) continue;

        try {
          const pkgProg = parseSyntaxTree({ source: indexSrc, entryFile: INDEX_FILE }).root;
          for (const pkgImp of pkgProg.imports) {
            // Only follow @pkg imports (not fragment imports)
            if (!pkgImp.path.startsWith("@")) continue;

            // Check circular dependency
            if (visited.has(pkgImp.path)) {
              // Already in the dependency graph — skip but don't error
              // (it's valid for multiple packages to import the same dep)
              continue;
            }

            // Validate against package's own pactia.toml [dependencies]
            const pkgTomlSrc = readOptional(join(pkgDir, TOML_FILE));
            if (pkgTomlSrc) {
              const pkgToml = parsePackageToml(pkgTomlSrc);
              if (!pkgToml.dependencies.get(pkgImp.path)) {
                loaderDiagnostics.push(
                  createDiagnostic(
                    DiagnosticCode.PackageImportUnresolved,
                    `Package '${coord}' imports '${pkgImp.path}' but it is not declared in its pactia.toml [dependencies]`,
                  ),
                );
                continue;
              }
            }

            visited.add(pkgImp.path);
            queue.push(pkgImp.path);
            coordinates.push(pkgImp.path);
            transitiveExplicit.add(pkgImp.path);
          }
        } catch {
          // Skip unparseable index.pactia files in transitive deps
        }
      }

      assertLockEntries(coordinates, lock);

      for (const coordinate of coordinates) {
        const entry = lock.packages.find((pkg) => pkg.name === coordinate)!;
        importPackages.push(loadVendoredPackage(input.workspaceRoot, coordinate, entry));
      }
    }


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

      // Apply aliases from consumer's import statement
      // e.g., `import { @api as @endpoint } from @pkg` → register both names
      const aliasTags = [...filtered.tags];
      const aliasMacros = [...filtered.macros];
      if (input.syntax) {
        for (const imp of input.syntax.root.imports) {
          if (imp.path !== pkg.coordinate || !imp.aliases) continue;
          for (const [aliasSymbol, originalSymbol] of imp.aliases) {
            // Determine sigil from the alias symbol (@, @@, #)
            const isHash = aliasSymbol.startsWith("#");
            const aliasName = isHash ? aliasSymbol.slice(1) : aliasSymbol.startsWith("@@") ? aliasSymbol.slice(2) : aliasSymbol.slice(1);
            const origName = isHash ? originalSymbol.slice(1) : originalSymbol.startsWith("@@") ? originalSymbol.slice(2) : originalSymbol.slice(1);

            if (isHash) {
              const macro = filtered.macros.find((m) => m.name === origName);
              if (macro) aliasMacros.push({ ...macro, name: aliasName });
            } else {
              const tag = filtered.tags.find((t) => t.name === origName);
              if (tag) aliasTags.push({ ...tag, name: aliasName });
            }
          }
          break;
        }
      }

      const contextExports = filterContextExports(
        program ? contextExportsFromProgram(program, pkg.coordinate) : [],
        partialSymbols,
      );

      // Transitive deps that are explicitly imported by a directly-imported
      // package get ExplicitImport tier — their symbols contribute to the registry.
      const isExplicit = imports.includes(pkg.coordinate)
        || transitiveExplicit.has(pkg.coordinate);
      const tier = isExplicit
        ? RegistryPrecedenceTier.ExplicitImport
        : RegistryPrecedenceTier.Dependency;

      // Warn if consumer redundantly imports a package already available transitively
      if (imports.includes(pkg.coordinate) && transitiveExplicit.has(pkg.coordinate)) {
        // This package was both explicitly imported AND transitively imported.
        // That's fine — the explicit import takes priority. No warning needed
        // because the consumer may want to use its symbols directly.
      }

      const allConstants = program
        ? constantsFromProgram(program)
        : [];

      // Load topology exports from manifest files for all profiles
      let topologyExports: ReturnType<typeof topologyExportsFromProgram> = [];
      const manifestRegistryTags: RegistryTagEntry[] = [];
      const manifestRegistryMacros: RegistryMacroEntry[] = [];
      const manifestConstants: { readonly name: string; readonly value: string }[] = [];
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
        // Process manifest exports for ALL profiles (registry files can also be split via export "./file")
        if (program.manifestExports.length > 0) {
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
              // Extract both topology and registry exports from manifest files
              topologyExports = topologyExports.concat(
                topologyExportsFromProgram(fileProgram, pkg.coordinate, fileSource),
              );
              const manifestReg = registryEntriesFromProgram(fileProgram, pkg.coordinate);
              manifestRegistryTags.push(...manifestReg.tags);
              manifestRegistryMacros.push(...manifestReg.macros);
              manifestConstants.push(...constantsFromProgram(fileProgram));
            } catch {
              // Skip unparseable manifest files
            }
          }
        }
        if (profile === PackageProfile.Topology || profile === PackageProfile.Mixed) {
          // Also include inline topology exports from index.pactia itself
          topologyExports = topologyExports.concat(
            topologyExportsFromProgram(program, pkg.coordinate, indexSource),
          );
        }
      }

      // Merge manifest registry exports with inline exports
      const allTags = [...aliasTags];
      const allMacros = [...aliasMacros];
      if (partialSymbols) {
        // Apply partial import filter to manifest exports too
        const manifestFiltered = applyPartialImportFilter(
          manifestRegistryTags,
          manifestRegistryMacros,
          partialSymbols,
        );
        allTags.push(...manifestFiltered.tags);
        allMacros.push(...manifestFiltered.macros);
      } else {
        allTags.push(...manifestRegistryTags);
        allMacros.push(...manifestRegistryMacros);
      }

      const mergedConstants = new Map<string, string>(
        (partialSymbols
          ? allConstants.filter((c) => partialSymbols.includes(c.name))
          : allConstants
        ).map((c) => [c.name, c.value] as const),
      );
      for (const mc of manifestConstants) {
        if (!partialSymbols || partialSymbols.includes(mc.name)) {
          mergedConstants.set(mc.name, mc.value);
        }
      }

      return {
        coordinate: pkg.coordinate,
        tier,
        tags: allTags,
        macros: allMacros,
        contexts: contextExports,
        constants: mergedConstants,
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
