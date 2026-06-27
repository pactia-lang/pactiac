import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DiagnosticCode, DiagnosticSeverity } from "../../domain/diagnostic-code.js";
import { hasErrors } from "../../domain/diagnostics.js";
import {
  collectFragmentPackageImportDiagnostics,
  collectImportUnusedDiagnostics,
  attachKindMismatchDiagnostic,
  attachUndefinedDiagnostic,
} from "./workspace-diagnostics.js";
import { FragmentExportKind } from "../../frontend/workspace/attach-merge.js";

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

describe("collectImportUnusedDiagnostics", () => {
  it("detects unused #macro in @ package partial imports", () => {
    const source = [
      "pactia 1.0",
      "import { @api, #unused_macro } from @pactia/kernel;",
      "product Demo {",
      "  module(main) {",
      "    service(api) {",
      "      @api ping { method: GET, path: \"/ping\" }",
      "    }",
      "  }",
      "}",
    ].join("\n");

    const diagnostics = collectImportUnusedDiagnostics(source, "product.pactia");

    // #unused_macro in import line is NOT matched by MACRO_USE regex
    // (regex requires #name followed by (, $, or { — import line has })
    const unusedDiags = diagnostics.filter(
      (d) => d.code === DiagnosticCode.ImportUnused,
    );
    const unusedMacroDiag = unusedDiags.find((d) =>
      d.message.includes("#unused_macro"),
    );
    assert.ok(unusedMacroDiag);
  });
});

describe("attach diagnostic helpers", () => {
  it("attachKindMismatchDiagnostic produces correct diagnostic", () => {
    const diag = attachKindMismatchDiagnostic(
      "orders",
      FragmentExportKind.Module,
      FragmentExportKind.Service,
      "product.pactia",
    );
    assert.equal(diag.code, DiagnosticCode.AttachKindMismatch);
    assert.match(diag.message, /Attach kind mismatch/);
    assert.match(diag.message, /orders/);
    assert.match(diag.message, /module/);
    assert.match(diag.message, /service/);
  });

  it("attachUndefinedDiagnostic produces correct diagnostic", () => {
    const diag = attachUndefinedDiagnostic("unknownModule", "product.pactia");
    assert.equal(diag.code, DiagnosticCode.AttachUndefined);
    assert.match(diag.message, /undefined symbol/);
    assert.match(diag.message, /unknownModule/);
  });
});
