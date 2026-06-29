import type { Diagnostic } from "../../domain/diagnostics.js";
import { DiagnosticCode, createDiagnostic } from "../../domain/index.js";
import { parseImportSymbol, ImportSymbolKind } from "../registry/import-symbol.js";
import { FragmentExportKind } from "../../frontend/workspace/attach-merge.js";

const ATTACH_MODULE = /module\s*\(\s*(\w+)\s*\)\s*\{/g;
const ATTACH_SERVICE = /service\s*\(\s*(\w+)\s*\)/g;
const ATTACH_MODEL = /model\s*\(\s*(\w+)\s*\)/g;
const PARTIAL_IMPORT = /import\s*\{([^}]+)\}\s+from\s+([^;]+);/g;
const TAG_USE = /@([A-Za-z_][\w]*)/g;
const MODIFIER_USE = /@@([A-Za-z_][\w]*)/g;
const MACRO_USE = /#([A-Za-z_][\w]*)\s*(?:\(|$|\{)/gm;

export function collectImportUnusedDiagnostics(
  productSource: string,
  entryFile: string,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const usedTags = new Set<string>();
  const usedModifiers = new Set<string>();
  const usedMacros = new Set<string>();
  const usedConstants = new Set<string>();

  let tagMatch: RegExpExecArray | null = TAG_USE.exec(productSource);
  while (tagMatch) {
    usedTags.add(tagMatch[1]!);
    tagMatch = TAG_USE.exec(productSource);
  }

  let modMatch: RegExpExecArray | null = MODIFIER_USE.exec(productSource);
  while (modMatch) {
    usedModifiers.add(modMatch[1]!);
    modMatch = MODIFIER_USE.exec(productSource);
  }

  let macroMatch: RegExpExecArray | null = MACRO_USE.exec(productSource);
  while (macroMatch) {
    usedMacros.add(macroMatch[1]!);
    macroMatch = MACRO_USE.exec(productSource);
  }

  let attachMatch: RegExpExecArray | null = ATTACH_MODULE.exec(productSource);
  while (attachMatch) {
    usedConstants.add(attachMatch[1]!);
    attachMatch = ATTACH_MODULE.exec(productSource);
  }

  attachMatch = ATTACH_SERVICE.exec(productSource);
  while (attachMatch) {
    usedConstants.add(attachMatch[1]!);
    attachMatch = ATTACH_SERVICE.exec(productSource);
  }

  attachMatch = ATTACH_MODEL.exec(productSource);
  while (attachMatch) {
    usedConstants.add(attachMatch[1]!);
    attachMatch = ATTACH_MODEL.exec(productSource);
  }

  const constantPattern = /\$\{([A-Za-z_][\w]*)\}/g;
  let constUse: RegExpExecArray | null = constantPattern.exec(productSource);
  while (constUse) {
    usedConstants.add(constUse[1]!);
    constUse = constantPattern.exec(productSource);
  }

  let importMatch: RegExpExecArray | null = PARTIAL_IMPORT.exec(productSource);
  while (importMatch) {
    const symbolList = importMatch[1]!;
    const rawPath = importMatch[2]!.trim();
    if (rawPath.startsWith("@")) {
      for (const raw of symbolList.split(",").map((part) => part.trim()).filter(Boolean)) {
        const parsed = parseImportSymbol(raw);
        const used =
          (parsed.kind === ImportSymbolKind.Tag && usedTags.has(parsed.name)) ||
          (parsed.kind === ImportSymbolKind.ModifierTag && usedModifiers.has(parsed.name)) ||
          (parsed.kind === ImportSymbolKind.Macro && usedMacros.has(parsed.name)) ||
          (parsed.kind === ImportSymbolKind.Constant && usedConstants.has(parsed.name));
        if (!used) {
          diagnostics.push(
            createDiagnostic(
              DiagnosticCode.ImportUnused,
              `Partial import symbol '${raw}' is never referenced`,
              { target: raw, location: { file: entryFile, line: 1, col: 1 } },
            ),
          );
        }
      }
    }
    importMatch = PARTIAL_IMPORT.exec(productSource);
  }

  return diagnostics;
}

export function attachKindMismatchDiagnostic(
  symbol: string,
  expected: FragmentExportKind,
  actual: FragmentExportKind,
  filePath: string,
): Diagnostic {
  return createDiagnostic(
    DiagnosticCode.AttachKindMismatch,
    `Attach kind mismatch for '${symbol}': expected ${expected}, got ${actual}`,
    { target: symbol, location: { file: filePath, line: 1, col: 1 } },
  );
}

export function attachUndefinedDiagnostic(symbol: string, filePath: string): Diagnostic {
  return createDiagnostic(
    DiagnosticCode.AttachUndefined,
    `Attach references undefined symbol '${symbol}'`,
    { target: symbol, location: { file: filePath, line: 1, col: 1 } },
  );
}

// Fragments now own their package imports in file-local model (1.4).
// Previously warned with FRAGMENT_PACKAGE_IMPORT; now a no-op.
// Use collectImportMissingDiagnostics to check symbol coverage per file.
export function collectFragmentPackageImportDiagnostics(
  _filePath: string,
  _source: string,
): readonly Diagnostic[] {
  return [];
}

const IMPORT_LINE = /^\s*import\s+.+;/gm;
const TAG_USAGE = /(?<![@#\w])@([A-Za-z_][\w]*)/g;
const MODIFIER_USAGE = /@@([A-Za-z_][\w]*)/g;
const MACRO_USAGE = /(?<![\w@])#([A-Za-z_][\w]*)/g;

function extractImportedSymbols(source: string): Set<string> {
  const symbols = new Set<string>();
  let match: RegExpExecArray | null = IMPORT_LINE.exec(source);
  while (match) {
    const line = match[0];
    // Bare import: import @pactia/kernel → wildcard (all symbols accepted)
    const bareMatch = /^import\s+(@\S+)\s*;/.exec(line);
    if (bareMatch) {
      symbols.add("*" + bareMatch[1]!); // marker: all from this package
    }
    // Partial import: import { @api, #list } from @pkg
    const partialMatch = /\{\s*([^}]+)\s*\}\s+from\s+(@\S+)/.exec(line);
    if (partialMatch) {
      for (const part of partialMatch[1]!.split(",").map((s) => s.trim()).filter(Boolean)) {
        symbols.add(part);
      }
    }
    match = IMPORT_LINE.exec(source);
  }
  return symbols;
}

function extractUsages(sourceWithoutImports: string): Map<string, number[]> {
  const usages = new Map<string, number[]>();
  const lines = sourceWithoutImports.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const line = lines[lineIdx]!;

    let tagMatch: RegExpExecArray | null = TAG_USAGE.exec(line);
    while (tagMatch) {
      const name = `@${tagMatch[1]}`;
      const positions = usages.get(name) ?? [];
      positions.push(lineIdx + 1);
      usages.set(name, positions);
      tagMatch = TAG_USAGE.exec(line);
    }

    let modMatch: RegExpExecArray | null = MODIFIER_USAGE.exec(line);
    while (modMatch) {
      const name = `@@${modMatch[1]}`;
      const positions = usages.get(name) ?? [];
      positions.push(lineIdx + 1);
      usages.set(name, positions);
      modMatch = MODIFIER_USAGE.exec(line);
    }

    let macroMatch: RegExpExecArray | null = MACRO_USAGE.exec(line);
    while (macroMatch) {
      const name = `#${macroMatch[1]}`;
      const positions = usages.get(name) ?? [];
      positions.push(lineIdx + 1);
      usages.set(name, positions);
      macroMatch = MACRO_USAGE.exec(line);
    }
  }

  return usages;
}

/**
 * Checks if every @tag, @@tag, #macro usage in a file has a corresponding import.
 * Emits IMPORT_MISSING for symbols used without an import statement.
 */
export function collectImportMissingDiagnostics(
  source: string,
  filePath: string,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Strip all import lines to avoid false positives (symbols in import lines)
  const sourceWithoutImports = source.replace(IMPORT_LINE, "");

  // Strip all export def lines to avoid false positives in package index files
  const sourceWithoutDefs = sourceWithoutImports.replace(
    /^\s*export\s+def\s+[@#@][\w]*/gm,
    "",
  );

  const imports = extractImportedSymbols(source);
  const usages = extractUsages(sourceWithoutDefs);

  // Check if any wildcard import covers all symbols
  const hasWildcard = [...imports].some((s) => s.startsWith("*"));

  for (const [symbol, lines] of usages) {
    if (hasWildcard || imports.has(symbol)) continue;

    // Also check bare symbol name (e.g. "api" if imported as "@api")
    const bareName = symbol.replace(/^[@#]+/, "");
    const importedAsBare = imports.has(bareName);

    if (!importedAsBare) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCode.ImportMissing,
          `Symbol '${symbol}' is used but not imported — add 'import { ${symbol} } from @package'`,
          { target: symbol, location: { file: filePath, line: lines[0]!, col: 1 } },
        ),
      );
    }
  }

  return diagnostics;
}

/**
 * Checks if every imported symbol in a file is actually used.
 * Emits UNUSED_IMPORT for imported symbols never referenced.
 * Skip wildcard imports (bare `import @pkg`) — no per-symbol tracking.
 */
export function collectUnusedImportDiagnostics(
  source: string,
  filePath: string,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const imports = extractImportedSymbols(source);

  const nonWildcardImports = [...imports].filter((s) => !s.startsWith("*"));
  if (nonWildcardImports.length === 0) return diagnostics;

  const sourceWithoutImports = source.replace(IMPORT_LINE, "");
  const sourceClean = sourceWithoutImports.replace(
    /^\s*export\s+def\s+[@#@][\w]*/gm,
    "",
  );

  const usages = extractUsages(sourceClean);

  for (const symbol of nonWildcardImports) {
    if (usages.has(symbol)) continue;
    const bareName = symbol.replace(/^[@#]+/, "");
    if (usages.has(bareName)) continue;

    diagnostics.push(
      createDiagnostic(
        DiagnosticCode.UnusedImport,
        `Imported symbol '${symbol}' is never referenced in this file`,
        { target: symbol, location: { file: filePath, line: 1, col: 1 } },
      ),
    );
  }

  return diagnostics;
}
