import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ImportSymbolKind,
  applyPartialImportFilter,
  parseImportSymbol,
} from "./import-symbol.js";

describe("import-symbol", () => {
  it("parses tag, modifier, macro, and constant import symbols", () => {
    assert.deepEqual(parseImportSymbol("@api"), {
      kind: ImportSymbolKind.Tag,
      name: "api",
      raw: "@api",
    });
    assert.deepEqual(parseImportSymbol("@@output"), {
      kind: ImportSymbolKind.ModifierTag,
      name: "output",
      raw: "@@output",
    });
    assert.deepEqual(parseImportSymbol("#list"), {
      kind: ImportSymbolKind.Macro,
      name: "list",
      raw: "#list",
    });
    assert.deepEqual(parseImportSymbol("max_page"), {
      kind: ImportSymbolKind.Constant,
      name: "max_page",
      raw: "max_page",
    });
  });

  it("filters registry entries for partial macro imports", () => {
    const tags = [{ name: "api" }, { name: "auth" }];
    const macros = [{ name: "list" }, { name: "paginated" }];
    const filtered = applyPartialImportFilter(tags, macros, ["#list"]);
    assert.deepEqual(filtered.tags, []);
    assert.deepEqual(filtered.macros.map((macro) => macro.name), ["list"]);
  });

  it("returns all entries when partial import list is absent", () => {
    const tags = [{ name: "api" }];
    const macros = [{ name: "list" }];
    const filtered = applyPartialImportFilter(tags, macros, undefined);
    assert.equal(filtered.tags.length, 1);
    assert.equal(filtered.macros.length, 1);
  });
});
