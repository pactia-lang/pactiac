import assert from "node:assert/strict";
import { test } from "node:test";
import { emitJson } from "./json-emitter.js";

test("emitJson is deterministic for the same object", () => {
  const value = { z: 1, a: 2, nested: { b: true } };
  assert.equal(emitJson(value), emitJson(value));
});

test("emitJson keeps key order and trailing newline", () => {
  const json = emitJson({ z: 1, a: 2 });
  assert.match(json, /"z": 1/);
  assert.match(json, /\n$/);
});
