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

const FRAGMENT_PACKAGE_IMPORT =
  /^\s*import\s+(?:\{\s*[^}]*\s*\}\s+from\s+)?(@\S+)\s*;/;

/** Warn on package imports in fragment files — they are ignored; product.pactia owns @ imports. */
export function collectFragmentPackageImportDiagnostics(
  filePath: string,
  source: string,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const match = FRAGMENT_PACKAGE_IMPORT.exec(line);
    if (!match) continue;
    const coordinate = match[1]!;
    diagnostics.push(
      createDiagnostic(
        DiagnosticCode.FragmentPackageImport,
        `Package import '${coordinate}' in a fragment is ignored — declare package imports in product.pactia only`,
        {
          target: coordinate,
          location: { file: filePath, line: index + 1, col: 1 },
        },
      ),
    );
  }
  return diagnostics;
}
