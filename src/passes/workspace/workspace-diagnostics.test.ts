import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DiagnosticCode } from "../../domain/diagnostic-code.js";
import {
  collectFragmentPackageImportDiagnostics,
  collectImportMissingDiagnostics,
  collectImportUnusedDiagnostics,
  collectUnusedImportDiagnostics,
  attachKindMismatchDiagnostic,
  attachUndefinedDiagnostic,
} from "./workspace-diagnostics.js";
import { FragmentExportKind } from "../../frontend/workspace/attach-merge.js";

describe("collectFragmentPackageImportDiagnostics", () => {
  it("no longer warns on package imports in fragments (file-local imports 1.4)", () => {
    const source = [
      "import @pactia/kernel;",
      "import { @api, #database } from @pactia/kernel;",
      "export service Demo {",
      "  @api ping { method: GET, path: \"/ping\" }",
      "}",
      "import { feature } from ./feature.pactia;",
    ].join("\n");

    const diagnostics = collectFragmentPackageImportDiagnostics("fragments/demo.service.pactia", source);
    // Fragments now own their imports — no warning
    assert.equal(diagnostics.length, 0);
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

describe("collectImportMissingDiagnostics", () => {
  it("passes when all symbols are imported via bare import", () => {
    const source = [
      "import @pactia/kernel;",
      "export service Demo {",
      "  @api ping { method: GET, path: \"/ping\" }",
      "}",
    ].join("\n");

    const diagnostics = collectImportMissingDiagnostics(source, "demo.service.pactia");
    assert.equal(diagnostics.length, 0);
  });

  it("passes when symbols are imported via partial import", () => {
    const source = [
      "import { @api, #list } from @pactia/kernel;",
      "export service Demo {",
      "  #list",
      "  @api ping { method: GET, path: \"/ping\" }",
      "}",
    ].join("\n");

    const diagnostics = collectImportMissingDiagnostics(source, "demo.service.pactia");
    assert.equal(diagnostics.length, 0);
  });

  it("detects missing imports for used but unimported symbols", () => {
    const source = [
      // No import for @api!
      "export service Demo {",
      "  @api ping { method: GET, path: \"/ping\" }",
      "}",
    ].join("\n");

    const diagnostics = collectImportMissingDiagnostics(source, "demo.service.pactia");
    assert.ok(diagnostics.length >= 1);
    const apiDiag = diagnostics.find((d) => d.message.includes("@api"));
    assert.ok(apiDiag, "Expected IMPORT_MISSING for @api");
    assert.equal(apiDiag?.code, DiagnosticCode.ImportMissing);
  });

  it("detects missing macro import", () => {
    const source = [
      // No import for #database!
      "export service Demo {",
      "  #database",
      "  @api ping { method: GET, path: \"/ping\" }",
      "}",
    ].join("\n");

    const diagnostics = collectImportMissingDiagnostics(source, "demo.service.pactia");
    const dbDiag = diagnostics.find((d) => d.message.includes("#database"));
    assert.ok(dbDiag, "Expected IMPORT_MISSING for #database");
    assert.equal(dbDiag?.code, DiagnosticCode.ImportMissing);
  });

  it("does not flag symbols used in export def declarations (package index)", () => {
    const source = [
      "export def @api in service {",
      "  method,",
      "  path,",
      "}",
      "export def #list in service {",
      "  #paginated",
      "}",
    ].join("\n");

    // export def @api and export def #list are declarations, not usages
    // #paginated inside export def body IS a usage but we strip def lines
    // The #paginated usage should trigger IMPORT_MISSING
    const diagnostics = collectImportMissingDiagnostics(source, "index.pactia");
    // @api and #list in export def lines are stripped
    // #paginated is a usage → should trigger
    const defDiags = diagnostics.filter((d) =>
      d.message.includes("@api") || d.message.includes("#list"),
    );
    assert.equal(defDiags.length, 0, "export def declarations should not trigger IMPORT_MISSING");
  });
});

describe("collectUnusedImportDiagnostics", () => {
  it("passes when all imported symbols are used", () => {
    const source = [
      "import { @api, #list } from @pactia/kernel;",
      "export service Demo {",
      "  #list",
      "  @api ping { method: GET, path: \"/ping\" }",
      "}",
    ].join("\n");

    const diagnostics = collectUnusedImportDiagnostics(source, "demo.service.pactia");
    assert.equal(diagnostics.length, 0);
  });

  it("detects imported symbol never used", () => {
    const source = [
      "import { @api, #unused } from @pactia/kernel;",
      "export service Demo {",
      "  @api ping { method: GET, path: \"/ping\" }",
      "}",
    ].join("\n");

    const diagnostics = collectUnusedImportDiagnostics(source, "demo.service.pactia");
    assert.ok(diagnostics.length >= 1);
    const unusedDiag = diagnostics.find((d) => d.message.includes("#unused"));
    assert.ok(unusedDiag, "Expected UNUSED_IMPORT for #unused");
    assert.equal(unusedDiag?.code, DiagnosticCode.UnusedImport);
  });

  it("skips wildcard imports", () => {
    const source = [
      "import @pactia/kernel;",
      "export service Demo {",
      "  @api ping { method: GET, path: \"/ping\" }",
      "}",
    ].join("\n");

    const diagnostics = collectUnusedImportDiagnostics(source, "demo.service.pactia");
    assert.equal(diagnostics.length, 0);
  });
});
