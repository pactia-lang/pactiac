import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compilePhaseOrder, CompilePhase } from "./compile-phase.js";
import { DiagnosticCode, DiagnosticSeverity, defaultSeverityForCode } from "./diagnostic-code.js";
import { createDiagnostic, hasErrors } from "./diagnostics.js";
import { IrFile, irFileForPlacement } from "./ir-file.js";
import { IrMerge, parseIrMerge } from "./ir-merge.js";
import { PlacementTarget, placementAllows } from "./placement.js";
import { moduleIrPaths, serviceIrPath } from "./workspace-ir.js";

describe("domain compile phases", () => {
  it("orders phases 0 through 12", () => {
    assert.equal(compilePhaseOrder.length, 13);
    assert.equal(compilePhaseOrder[0], CompilePhase.AssembleWorkspace);
    assert.equal(compilePhaseOrder[12], CompilePhase.Emit);
  });
});

describe("domain placement", () => {
  it("checks in targets", () => {
    assert.equal(
      placementAllows([PlacementTarget.Service], PlacementTarget.Service),
      true,
    );
    assert.equal(
      placementAllows([PlacementTarget.Model], PlacementTarget.Service),
      false,
    );
  });

  it("maps placement to IR file", () => {
    assert.equal(irFileForPlacement(PlacementTarget.Product), IrFile.Product);
    assert.equal(irFileForPlacement(PlacementTarget.Field), IrFile.Model);
    assert.equal(irFileForPlacement(PlacementTarget.Service), IrFile.Service);
  });
});

describe("domain ir merge", () => {
  it("parses merge strategy strings", () => {
    assert.equal(parseIrMerge("append_host"), IrMerge.AppendHost);
    assert.equal(parseIrMerge("unknown"), undefined);
  });
});

describe("domain diagnostics", () => {
  it("defaults TagBodyUnknownField to warning severity", () => {
    assert.equal(
      defaultSeverityForCode(DiagnosticCode.TagBodyUnknownField),
      DiagnosticSeverity.Warning,
    );
  });

  it("detects error diagnostics", () => {
    const items = [
      createDiagnostic(DiagnosticCode.UnknownSymbol, "missing @entity"),
      createDiagnostic(DiagnosticCode.TagBodyUnknownField, "extra field"),
    ];
    assert.equal(hasErrors(items), true);
  });
});

describe("domain workspace ir paths", () => {
  it("builds module and service relative paths", () => {
    const paths = moduleIrPaths("fleet");
    assert.equal(paths.module, "input/modules/fleet/fleet.module.json");
    assert.equal(paths.model, "input/modules/fleet/fleet.model.json");
    assert.equal(
      serviceIrPath("fleet", "order"),
      "input/modules/fleet/services/order.service.json",
    );
  });
});
