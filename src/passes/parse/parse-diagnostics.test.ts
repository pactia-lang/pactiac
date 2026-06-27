import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { substituteModuleConstants, moduleConstantsFromModules } from "./substitute-constants.js";
import { SyntaxNodeKind } from "../../domain/syntax-tree.js";
import type { ModuleNode, ModuleConstNode } from "../../domain/syntax-tree.js";

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

describe("moduleConstantsFromModules", () => {
  it("extracts constants from module items", () => {
    const constNode: ModuleConstNode = {
      kind: SyntaxNodeKind.ModuleConst,
      name: "max_page",
      value: "100",
      location: { file: "module.pactia", line: 1, col: 1 },
    };
    const modules: ModuleNode[] = [{
      kind: SyntaxNodeKind.Module,
      name: "commerce",
      items: [
        constNode,
        { kind: SyntaxNodeKind.Prose, text: "hello", multiline: false, location: { file: "x", line: 2, col: 1 } },
      ],
      location: { file: "module.pactia", line: 1, col: 1 },
    }];

    const constants = moduleConstantsFromModules(modules);
    assert.equal(constants.size, 1);
    assert.equal(constants.get("max_page"), "100");
  });

  it("returns empty map for modules without constants", () => {
    const modules: ModuleNode[] = [{
      kind: SyntaxNodeKind.Module,
      name: "empty",
      items: [],
      location: { file: "module.pactia", line: 1, col: 1 },
    }];

    const constants = moduleConstantsFromModules(modules);
    assert.equal(constants.size, 0);
  });
});
