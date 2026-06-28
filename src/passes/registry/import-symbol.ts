/** Parsed import list entry per spec/docs/grammar-reference.md ImportSymbol. */
export enum ImportSymbolKind {
  Tag = "tag",
  ModifierTag = "modifier-tag",
  Macro = "macro",
  Constant = "constant",
}

export interface ParsedImportSymbol {
  readonly kind: ImportSymbolKind;
  readonly name: string;
  readonly raw: string;
}

export function parseImportSymbol(raw: string): ParsedImportSymbol {
  if (raw.startsWith("@@")) {
    return { kind: ImportSymbolKind.ModifierTag, name: raw.slice(2), raw };
  }
  if (raw.startsWith("@")) {
    return { kind: ImportSymbolKind.Tag, name: raw.slice(1), raw };
  }
  if (raw.startsWith("#")) {
    return { kind: ImportSymbolKind.Macro, name: raw.slice(1), raw };
  }
  return { kind: ImportSymbolKind.Constant, name: raw, raw };
}

export interface PartialImportFilter {
  readonly tagNames: ReadonlySet<string>;
  readonly macroNames: ReadonlySet<string>;
}

export function partialImportFilterFromSymbols(symbols: readonly string[]): PartialImportFilter {
  const tagNames = new Set<string>();
  const macroNames = new Set<string>();
  for (const raw of symbols) {
    const parsed = parseImportSymbol(raw);
    if (parsed.kind === ImportSymbolKind.Tag || parsed.kind === ImportSymbolKind.ModifierTag) {
      tagNames.add(parsed.name);
    } else if (parsed.kind === ImportSymbolKind.Macro) {
      macroNames.add(parsed.name);
    }
  }
  return { tagNames, macroNames };
}

export function applyPartialImportFilter<
  TTag extends { readonly name: string },
  TMacro extends { readonly name: string },
>(
  tags: readonly TTag[],
  macros: readonly TMacro[],
  symbols: readonly string[] | undefined,
): { readonly tags: TTag[]; readonly macros: TMacro[] } {
  // No filter or wildcard: return all entries
  if (!symbols || symbols.length === 0 || symbols.includes("*")) {
    return { tags: [...tags], macros: [...macros] };
  }

  const filter = partialImportFilterFromSymbols(symbols);
  const hasTagFilter = filter.tagNames.size > 0;
  const hasMacroFilter = filter.macroNames.size > 0;

  return {
    tags: hasTagFilter ? tags.filter((tag) => filter.tagNames.has(tag.name)) : [],
    macros: hasMacroFilter ? macros.filter((macro) => filter.macroNames.has(macro.name)) : [],
  };
}
