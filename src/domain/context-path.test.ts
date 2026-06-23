import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseContextPathField } from "./context-path.js";

describe("parseContextPathField", () => {
  it("parses a single quoted file path", () => {
    assert.equal(parseContextPathField('"./docs/api.md"'), "./docs/api.md");
  });

  it("parses a path array", () => {
    assert.deepEqual(parseContextPathField('["./a.md", "./b.png"]'), ["./a.md", "./b.png"]);
  });

  it("parses a directory path", () => {
    assert.equal(parseContextPathField('"./assets/runbooks/"'), "./assets/runbooks/");
  });
});
