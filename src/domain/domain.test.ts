import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compilePhaseOrder, CompilePhase, compilePhaseLabel } from "./compile-phase.js";
import { DiagnosticCode, DiagnosticSeverity, defaultSeverityForCode } from "./diagnostic-code.js";
import { createDiagnostic, hasErrors } from "./diagnostics.js";
import { IrFile, irFileForPlacement, parseIrFile } from "./ir-file.js";
import { IrMerge, parseIrMerge } from "./ir-merge.js";
import { PlacementTarget, placementAllows } from "./placement.js";
import { RegistryEntryKind, isRegistryTagEntry, isRegistryMacroEntry } from "./registry.js";
import type { RegistryTagEntry, RegistryMacroEntry } from "./registry.js";
import { moduleIrPaths, serviceIrPath } from "./workspace-ir.js";
import { BoundNodeKind, boundNodeLocation } from "./bound-tree.js";
import type { BoundNode } from "./bound-tree.js";
import { detectPackageProfile, PackageProfile, SyntaxNodeKind, DefSigil } from "./syntax-tree.js";
import type { ProgramNode } from "./syntax-tree.js";

describe("domain compile phases", () => {
  it("orders phases 0 through 12", () => {
    assert.equal(compilePhaseOrder.length, 13);
    assert.equal(compilePhaseOrder[0], CompilePhase.AssembleWorkspace);
    assert.equal(compilePhaseOrder[12], CompilePhase.Emit);
  });

  it("labels every phase", () => {
    for (const phase of compilePhaseOrder) {
      const label = compilePhaseLabel(phase);
      assert.ok(typeof label === "string" && label.length > 0);
    }
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

describe("domain ir file", () => {
  it("parses valid ir file names", () => {
    assert.equal(parseIrFile("product"), IrFile.Product);
    assert.equal(parseIrFile("module"), IrFile.Module);
    assert.equal(parseIrFile("model"), IrFile.Model);
    assert.equal(parseIrFile("service"), IrFile.Service);
  });

  it("returns undefined for unknown ir file names", () => {
    assert.equal(parseIrFile("unknown"), undefined);
    assert.equal(parseIrFile(""), undefined);
  });
});

describe("domain ir merge", () => {
  it("parses merge strategy strings", () => {
    assert.equal(parseIrMerge("append_host"), IrMerge.AppendHost);
    assert.equal(parseIrMerge("unknown"), undefined);
  });
});

describe("domain registry type guards", () => {
  const tagEntry: RegistryTagEntry = {
    kind: RegistryEntryKind.Tag,
    name: "@api",
    source: "@pactia/kernel",
    in: [PlacementTarget.Service],
    fields: { required: ["method"], optional: [], modifier: false, openExtension: true },
    modifier: false,
    ir: { file: IrFile.Service, path: "", merge: IrMerge.AppendHost },
  };

  const macroEntry: RegistryMacroEntry = {
    kind: RegistryEntryKind.Macro,
    name: "#list",
    source: "@pactia/kernel",
    in: [PlacementTarget.Service],
    params: [],
    body: { lines: [], items: [] },
  };

  it("isRegistryTagEntry returns true for tags", () => {
    assert.equal(isRegistryTagEntry(tagEntry), true);
    assert.equal(isRegistryTagEntry(macroEntry), false);
  });

  it("isRegistryMacroEntry returns true for macros", () => {
    assert.equal(isRegistryMacroEntry(macroEntry), true);
    assert.equal(isRegistryMacroEntry(tagEntry), false);
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

describe("bound tree helpers", () => {
  it("boundNodeLocation returns the node location", () => {
    const loc = { file: "test.pactia", line: 5, col: 3 };
    const node: BoundNode = {
      kind: BoundNodeKind.BoundBlock,
      placement: PlacementTarget.Product,
      hostName: "Test",
      children: [],
      location: loc,
    };
    assert.deepEqual(boundNodeLocation(node), loc);
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

describe("detectPackageProfile", () => {
  function makeProgram(overrides: Partial<ProgramNode> = {}): ProgramNode {
    return {
      kind: SyntaxNodeKind.Workspace,
      version: "1.0",
      imports: [],
      exportDefs: [],
      fragmentExports: [],
      fragmentServiceExports: [],
      fragmentModelExports: [],
      fragmentContextExports: [],
      constantExports: [],
      manifestExports: [],
      product: undefined,
      location: { file: "test", line: 1, col: 1 },
      ...overrides,
    };
  }

  it("returns Registry for def-only packages", () => {
    const prog = makeProgram({
      exportDefs: [{ kind: SyntaxNodeKind.DefExport, exported: true, sigil: DefSigil.Tag, name: "api", params: [], inTargets: [PlacementTarget.Service], modifier: false, bodyItems: [], bodySource: "", location: { file: "x", line: 1, col: 1 } }],
    });
    assert.equal(detectPackageProfile(prog), PackageProfile.Registry);
  });

  it("returns Registry for constant-only packages", () => {
    const prog = makeProgram({
      constantExports: [{ kind: SyntaxNodeKind.PackageConst, name: "max_page", value: "100", hasDef: true, location: { file: "x", line: 1, col: 1 } }],
    });
    assert.equal(detectPackageProfile(prog), PackageProfile.Registry);
  });

  it("returns Topology for module exports", () => {
    const prog = makeProgram({
      fragmentExports: [{ kind: SyntaxNodeKind.Module, name: "commerce", items: [], location: { file: "x", line: 1, col: 1 } }],
    });
    assert.equal(detectPackageProfile(prog), PackageProfile.Topology);
  });

  it("returns Topology for manifest exports", () => {
    const prog = makeProgram({ manifestExports: ["./x.pactia"] });
    assert.equal(detectPackageProfile(prog), PackageProfile.Topology);
  });

  it("returns Mixed for both defs and topology", () => {
    const prog = makeProgram({
      exportDefs: [{ kind: SyntaxNodeKind.DefExport, exported: true, sigil: DefSigil.Tag, name: "api", params: [], inTargets: [PlacementTarget.Service], modifier: false, bodyItems: [], bodySource: "", location: { file: "x", line: 1, col: 1 } }],
      fragmentExports: [{ kind: SyntaxNodeKind.Module, name: "commerce", items: [], location: { file: "x", line: 1, col: 1 } }],
    });
    assert.equal(detectPackageProfile(prog), PackageProfile.Mixed);
  });
});
