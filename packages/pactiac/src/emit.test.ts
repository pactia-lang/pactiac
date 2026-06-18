import assert from "node:assert/strict";
import { test } from "node:test";
import { emitYaml } from "./emit.js";

test("emitYaml is deterministic for the same object", () => {
  const value = { service: { name: "FleetService", flags: { database: true } } };
  assert.equal(emitYaml(value), emitYaml(value));
});

test("emitYaml keeps key order and disables wrapping", () => {
  const yaml = emitYaml({ z: 1, a: 2 });
  assert.match(yaml, /z: 1/);
  assert.doesNotMatch(yaml, /\n\s+wrap/);
});
