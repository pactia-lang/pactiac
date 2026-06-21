import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IrFile } from "../../domain/ir-file.js";
import { IrMerge } from "../../domain/ir-merge.js";
import { DefSigil, SyntaxNodeKind } from "../../domain/syntax-tree.js";
import { PlacementTarget } from "../../domain/placement.js";
import { deriveIrSlotForTag } from "./derive-tag-ir.js";

describe("deriveIrSlotForTag", () => {
  it("derives known tag IR slots", () => {
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
      path: "endpoints[]",
      merge: IrMerge.AppendHost,
    });
  });
});
