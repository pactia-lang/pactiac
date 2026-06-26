import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IrBodySlot } from "../../domain/ir-body.js";
import { IrFile } from "../../domain/ir-file.js";
import { IrMerge } from "../../domain/ir-merge.js";
import { DefSigil, SyntaxNodeKind } from "../../domain/syntax-tree.js";
import { PlacementTarget } from "../../domain/placement.js";
import { deriveIrSlotForTag } from "./derive-tag-ir.js";

describe("deriveIrSlotForTag", () => {
  it("derives body[] for @api host tags", () => {
    const apiDef = {
      kind: SyntaxNodeKind.DefExport,
      exported: true,
      sigil: DefSigil.Tag,
      name: "api",
      params: [],
      inTargets: [PlacementTarget.Service],
      modifier: false,
      bodyItems: [],
      bodySource: "",
      location: { file: "index.pactia", line: 1, col: 1 },
    };
    assert.deepEqual(deriveIrSlotForTag(apiDef), {
      file: IrFile.Service,
      path: IrBodySlot.BodyArray,
      merge: IrMerge.AppendHost,
    });
  });

  it("derives body[] for @entity host tags", () => {
    const entityDef = {
      kind: SyntaxNodeKind.DefExport,
      exported: true,
      sigil: DefSigil.Tag,
      name: "entity",
      params: [],
      inTargets: [PlacementTarget.Model],
      modifier: false,
      bodyItems: [],
      bodySource: "",
      location: { file: "index.pactia", line: 1, col: 1 },
    };
    assert.deepEqual(deriveIrSlotForTag(entityDef), {
      file: IrFile.Model,
      path: IrBodySlot.BodyArray,
      merge: IrMerge.AppendHost,
    });
  });

  it("derives body[] for unknown host tags", () => {
    const customDef = {
      kind: SyntaxNodeKind.DefExport,
      exported: true,
      sigil: DefSigil.Tag,
      name: "custom_policy",
      params: [],
      inTargets: [PlacementTarget.Module],
      modifier: false,
      bodyItems: [],
      bodySource: "",
      location: { file: "index.pactia", line: 1, col: 1 },
    };
    assert.deepEqual(deriveIrSlotForTag(customDef), {
      file: IrFile.Module,
      path: IrBodySlot.BodyArray,
      merge: IrMerge.AppendHost,
    });
  });

  it("derives merge_into_host for modifier defs", () => {
    const outputDef = {
      kind: SyntaxNodeKind.DefExport,
      exported: true,
      sigil: DefSigil.Tag,
      name: "output",
      params: [],
      inTargets: [PlacementTarget.Service],
      modifier: true,
      bodyItems: [],
      bodySource: "",
      location: { file: "index.pactia", line: 1, col: 1 },
    };
    assert.deepEqual(deriveIrSlotForTag(outputDef), {
      file: IrFile.Service,
      path: "modifiers",
      merge: IrMerge.MergeIntoHost,
    });
  });
});
