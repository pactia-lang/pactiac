import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateBoundTree } from "./index.js";
import {
  BoundNodeKind,
  DiagnosticCode,
  DiagnosticSeverity,
  IrFile,
  IrMerge,
  PlacementTarget,
  RegistryEntryKind,
  type BoundBlockNode,
  type BoundTagNode,
  type BoundTree,
} from "../../domain/index.js";
import { SyntaxNodeKind, type FieldLineNode } from "../../domain/syntax-tree.js";
import type { RegistryTagEntry } from "../../domain/registry.js";

const LOC = { file: "test.pactia", line: 1, col: 1 };

function makeField(name: string): FieldLineNode {
  return {
    kind: SyntaxNodeKind.FieldLine,
    name,
    type: "string",
    required: true,
    array: false,
    modifierTags: [],
    location: LOC,
  };
}

function makeTag(
  tagName: string,
  fields: FieldLineNode[],
  opts?: { modifier?: boolean; required?: string[]; optional?: string[]; openExtension?: boolean },
): BoundTagNode {
  const spec = {
    required: opts?.required ?? [],
    optional: opts?.optional ?? [],
    modifier: opts?.modifier ?? false,
    openExtension: opts?.openExtension ?? false,
  };
  return {
    kind: BoundNodeKind.BoundTag,
    tagName,
    registryEntry: {
      kind: RegistryEntryKind.Tag,
      name: tagName,
      source: "@pactia/test",
      in: [PlacementTarget.Service],
      fields: spec,
      modifier: spec.modifier,
      ir: { file: IrFile.Service, path: "", merge: IrMerge.AppendHost },
    },
    enclosing: PlacementTarget.Service,
    children: fields,
    location: LOC,
  };
}

function makeTree(children: BoundTagNode[]): BoundTree {
  return {
    entryFile: "test.pactia",
    root: {
      kind: BoundNodeKind.BoundBlock,
      placement: PlacementTarget.Product,
      children: [
        {
          kind: BoundNodeKind.BoundBlock,
          placement: PlacementTarget.Module,
          children: [
            {
              kind: BoundNodeKind.BoundBlock,
              placement: PlacementTarget.Service,
              children,
              location: LOC,
              hostName: "TestService",
            },
          ],
          location: LOC,
          hostName: "test_module",
        },
      ],
      location: LOC,
    },
  };
}

describe("validateBoundTree", () => {
  it("passes when all required fields are present", () => {
    const tree = makeTree([
      makeTag("api", [makeField("method"), makeField("path")], {
        required: ["method", "path"],
      }),
    ]);
    const result = validateBoundTree(tree);
    assert.equal(result.diagnostics.length, 0);
  });

  it("reports TAG_BODY_MISSING_FIELD for missing required fields", () => {
    const tree = makeTree([
      makeTag("api", [makeField("method")], {
        required: ["method", "path", "summary"],
      }),
    ]);
    const result = validateBoundTree(tree);
    const missing = result.diagnostics.filter(
      (d) => d.code === DiagnosticCode.TagBodyMissingField,
    );
    assert.equal(missing.length, 2); // path and summary
    assert.ok(missing.some((d) => d.message.includes("path")));
    assert.ok(missing.some((d) => d.message.includes("summary")));
  });

  it("reports TAG_BODY_UNKNOWN_FIELD for undeclared fields (closed extension)", () => {
    const tree = makeTree([
      makeTag("api", [makeField("method"), makeField("unknown_field")], {
        required: ["method"],
      }),
    ]);
    const result = validateBoundTree(tree);
    const unknown = result.diagnostics.filter(
      (d) => d.code === DiagnosticCode.TagBodyUnknownField,
    );
    assert.equal(unknown.length, 1);
    assert.ok(unknown[0]!.message.includes("unknown_field"));
  });

  it("does not report TAG_BODY_UNKNOWN_FIELD with openExtension", () => {
    const tree = makeTree([
      makeTag("api", [makeField("method"), makeField("anything")], {
        required: [],
        openExtension: true,
      }),
    ]);
    const result = validateBoundTree(tree);
    const unknown = result.diagnostics.filter(
      (d) => d.code === DiagnosticCode.TagBodyUnknownField,
    );
    assert.equal(unknown.length, 0);
  });

  it("reports CLAUSE_DUPLICATE_KEY for repeated field names", () => {
    const tree = makeTree([
      makeTag("api", [makeField("method"), makeField("method")], {
        required: ["method"],
      }),
    ]);
    const result = validateBoundTree(tree);
    const dupes = result.diagnostics.filter(
      (d) => d.code === DiagnosticCode.ClauseDuplicateKey,
    );
    assert.equal(dupes.length, 1);
    assert.ok(dupes[0]!.message.includes("method"));
  });

  it("skips modifier tags (@@name)", () => {
    const tree = makeTree([
      makeTag("output", [makeField("bodyRef")], {
        modifier: true,
        required: ["bodyRef"],
      }),
    ]);
    const result = validateBoundTree(tree);
    assert.equal(result.diagnostics.length, 0);
  });

  it("produces warnings (not errors) for all validation codes", () => {
    const tree = makeTree([
      makeTag("api", [makeField("x"), makeField("x")], {
        required: ["missing"],
      }),
    ]);
    const result = validateBoundTree(tree);
    assert.ok(result.diagnostics.length > 0);
    for (const d of result.diagnostics) {
      assert.equal(d.severity, DiagnosticSeverity.Warning);
    }
  });
});