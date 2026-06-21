import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DiagnosticCode } from "../../domain/diagnostic-code.js";
import { collectLegacyMacroDiagnostics } from "./collect-parse-diagnostics.js";
import { parseSyntaxTree } from "./recursive-descent-parser.js";
import { substituteModuleConstants } from "./substitute-constants.js";

describe("collectLegacyMacroDiagnostics", () => {
  it("warns on legacy #[macro] bracket syntax", () => {
    const source = [
      "pactia 1.0",
      "product Demo {",
      "  module orders {",
      "    service OrderService {",
      "      #[list]",
      "    }",
      "  }",
      "}",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const diagnostics = collectLegacyMacroDiagnostics(tree);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]?.code, DiagnosticCode.LegacyMacroSyntax);
  });
});

describe("substituteModuleConstants", () => {
  it("replaces ${name} with module constant values", () => {
    const result = substituteModuleConstants("page size ${max_page}", new Map([["max_page", "100"]]));
    assert.equal(result.text, "page size 100");
    assert.deepEqual(result.unresolved, []);
  });

  it("leaves unresolved placeholders intact", () => {
    const result = substituteModuleConstants("limit ${missing}", new Map());
    assert.equal(result.text, "limit ${missing}");
    assert.deepEqual(result.unresolved, ["missing"]);
  });
});
