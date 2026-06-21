import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../test/fixture-paths.js";
import { assembleWorkspace } from "../frontend/workspace/assemble.js";
import { compileSource } from "../application/compile-source.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const relayWorkspaceRoot = join(repoRoot, "test/fixtures/workspace/relay");

const expectedFiles = [
  "input/manifest.json",
  "input/product.json",
  "input/modules/orders/orders.module.json",
  "input/modules/orders/orders.model.json",
  "input/modules/orders/services/order.service.json",
] as const;

function compileRelayMonolith() {
  process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
  assembleWorkspace(relayWorkspaceRoot);
  return compileSource({
    source: readTestFixture(TestFixtureId.Relay),
    workspaceRoot: relayWorkspaceRoot,
    entryFile: "product.pactia",
  });
}

test("compile relay fixture emits expected IR file set", () => {
  const { files } = compileRelayMonolith();
  assert.deepEqual([...files.keys()].sort(), [...expectedFiles].sort());
});
