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
import {
  assertImportsDeclared,
  assertLockEntries,
  parsePactiaLock,
  parsePactiaToml,
} from "../resolve/manifest.js";
import { parseSyntaxTree } from "../passes/parse/recursive-descent-parser.js";
import {
  mergeEffectiveRegistry,
  registryEntriesFromLocalDefs,
  registryEntriesFromProgram,
} from "../passes/registry/build-effective-registry.js";
import { applyPartialImportFilter } from "../passes/registry/import-symbol.js";

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

      const tier = imports.includes(pkg.coordinate)
        ? RegistryPrecedenceTier.ExplicitImport
        : RegistryPrecedenceTier.Dependency;

      return {
        coordinate: pkg.coordinate,
        tier,
        tags: filtered.tags,
        macros: filtered.macros,
      };
    });

    importEntries.sort((left, right) => tierRank(left.tier) - tierRank(right.tier));

    const localDefs = input.syntax ? collectLocalDefs(programModules(input.syntax)) : [];
    const local = registryEntriesFromLocalDefs(localDefs, "local");

    return mergeEffectiveRegistry({
      importEntries,
      localTags: local.tags,
      localMacros: local.macros,
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
