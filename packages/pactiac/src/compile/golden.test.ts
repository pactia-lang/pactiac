import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../test/fixture-paths.js";
import { compile } from "./compile.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const expectedRoot = join(repoRoot, "test/fixtures/expected/fleet");

const expectedFiles = [
  "manifest.yaml",
  "product.yaml",
  "modules/fleet/fleet.module.yaml",
  "modules/fleet/fleet.model.yaml",
  "modules/fleet/services/fleet.service.yaml",
  "modules/fleet/services/notification.service.yaml",
] as const;

test("compile fleet fixture matches golden IR workspace", () => {
  const source = readTestFixture(TestFixtureId.FleetManagementV2);
  const { files } = compile(source);

  assert.deepEqual([...files.keys()].sort(), [...expectedFiles].sort());

  for (const relativePath of expectedFiles) {
    const expected = readFileSync(join(expectedRoot, relativePath), "utf8");
    const actual = files.get(relativePath);
    assert.equal(actual, expected, `Mismatch for ${relativePath}`);
  }
});

test("compile fleet fixture validates against @pactia/schema", async () => {
  const { irWorkspaceSchema } = await import("@pactia/schema");
  const { compileIrWorkspace } = await import("../lower/ir.js");
  const source = readTestFixture(TestFixtureId.FleetManagementV2);
  const { workspace } = compileIrWorkspace(source);
  irWorkspaceSchema.parse(workspace);
});
