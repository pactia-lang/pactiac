import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../test/fixture-paths.js";
import { assembleWorkspace } from "../frontend/workspace/assemble.js";
import { compileIrWorkspace } from "../lower/ir.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const expectedRoot = join(repoRoot, "test/fixtures/expected/relay");
const relayWorkspaceRoot = join(repoRoot, "test/fixtures/workspace/relay");

const expectedFiles = [
  "input/manifest.json",
  "input/product.json",
  "input/modules/orders/orders.module.json",
  "input/modules/orders/orders.model.json",
  "input/modules/orders/services/order.service.json",
] as const;

test("compile relay fixture matches golden IR workspace", () => {
  const source = readTestFixture(TestFixtureId.Relay);
  const assembled = assembleWorkspace(relayWorkspaceRoot);
  const { files } = compileIrWorkspace(source, {
    effectiveRegistry: assembled.effectiveRegistry,
    packagesResolved: assembled.lockfileDigest !== undefined,
    lockfileDigest: assembled.lockfileDigest,
    loadedPackages: assembled.loadedPackages,
  });

  assert.deepEqual([...files.keys()].sort(), [...expectedFiles].sort());

  for (const relativePath of expectedFiles) {
    const expected = readFileSync(join(expectedRoot, relativePath), "utf8");
    const actual = files.get(relativePath);
    assert.equal(actual, expected, `Mismatch for ${relativePath}`);
  }
});

test("compile relay fixture validates against @pactia/schema", async () => {
  const { irWorkspaceSchema } = await import("@pactia/schema");
  const { compileIrWorkspace } = await import("../lower/ir.js");
  const source = readTestFixture(TestFixtureId.Relay);
  const { workspace } = compileIrWorkspace(source);
  irWorkspaceSchema.parse(workspace);
});
