import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DiagnosticCode, DiagnosticSeverity } from "../../domain/diagnostic-code.js";
import { hasErrors } from "../../domain/diagnostics.js";
import { collectFragmentPackageImportDiagnostics } from "./workspace-diagnostics.js";

describe("collectFragmentPackageImportDiagnostics", () => {
  it("warns on package imports and ignores local fragment imports", () => {
    const source = [
      "import @pactia/kernel;",
      "import { @api, #database } from @pactia/kernel;",
      "export service Demo {",
      "  @api ping { method: GET, path: \"/ping\" }",
      "}",
      "import { feature } from ./feature.pactia;",
    ].join("\n");

    const diagnostics = collectFragmentPackageImportDiagnostics("fragments/demo.service.pactia", source);
    assert.equal(diagnostics.length, 2);
    assert.equal(diagnostics[0]?.code, DiagnosticCode.FragmentPackageImport);
    assert.equal(diagnostics[0]?.severity, DiagnosticSeverity.Warning);
    assert.match(diagnostics[0]?.message ?? "", /product\.pactia/);
    assert.equal(hasErrors(diagnostics), false);
  });
});
