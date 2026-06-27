import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { substituteModuleConstants } from "./substitute-constants.js";

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
