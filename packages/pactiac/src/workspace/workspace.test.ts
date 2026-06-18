import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { compile, compileWorkspace } from "../compile.js";
import { discoverWorkspace } from "./discover.js";
import { mergeWorkspaceSources } from "./merge.js";
import { assembleWorkspace } from "./assemble.js";
import { readTestFixture, TestFixtureId } from "../../../../test/fixture-paths.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const fleetWorkspaceRoot = join(repoRoot, "test/fixtures/workspace/fleet");
const vendorRoot = join(repoRoot, "test/fixtures/packages");
const expectedRoot = join(repoRoot, "test/fixtures/expected/fleet");

const expectedFiles = [
  "manifest.yaml",
  "product.yaml",
  "modules/fleet/fleet.module.yaml",
  "modules/fleet/fleet.model.yaml",
  "modules/fleet/services/fleet.service.yaml",
  "modules/fleet/services/notification.service.yaml",
] as const;

function withVendorRoot<T>(fn: () => T): T {
  const previous = process.env["PACTIA_VENDOR_ROOT"];
  process.env["PACTIA_VENDOR_ROOT"] = vendorRoot;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
    else process.env["PACTIA_VENDOR_ROOT"] = previous;
  }
}

function readExpected(relativePath: string): string {
  const path = join(expectedRoot, relativePath);
  assert.ok(existsSync(path), `Missing expected fixture ${path}`);
  return readFileSync(path, "utf8");
}

test("discoverWorkspace finds fleet workspace layout", () => {
  const files = discoverWorkspace(fleetWorkspaceRoot);
  assert.equal(files.modules.length, 1);
  assert.equal(files.modules[0]!.moduleName, "fleet");
  assert.equal(files.modules[0]!.services.length, 2);
  assert.equal(files.modules[0]!.featureFiles.size, 4);
  assert.ok(files.pactiaTomlSource);
  assert.ok(files.pactiaLockSource);
});

test("mergeWorkspaceSources produces extractable kernel source", () => {
  const files = discoverWorkspace(fleetWorkspaceRoot);
  const merged = mergeWorkspaceSources(files);
  assert.match(merged.source, /product FleetManagement/);
  assert.match(merged.source, /module fleet/);
  assert.match(merged.source, /service FleetService/);
  assert.match(merged.source, /@api list_vehicles/);
});

test("assembleWorkspace resolves vendored packages when PACTIA_VENDOR_ROOT is set", () => {
  withVendorRoot(() => {
    const assembled = assembleWorkspace(fleetWorkspaceRoot);
    assert.ok(assembled.lockfileDigest?.startsWith("sha256:"));
  });
});

test("compileWorkspace fleet fixture matches monolith without PACTIA_VENDOR_ROOT", () => {
  const { files } = compileWorkspace(fleetWorkspaceRoot);
  const monolithResult = compile(readTestFixture(TestFixtureId.FleetManagementV2));

  for (const relativePath of expectedFiles) {
    if (relativePath === "manifest.yaml") continue;
    assert.equal(files.get(relativePath), monolithResult.files.get(relativePath));
  }
});

test("compileWorkspace website example matches spec monolith IR slices", () => {
  const websiteRoot = join(repoRoot, "..", "examples", "pactia-lang-website");
  if (!existsSync(websiteRoot)) return;

  const specMonolith = join(repoRoot, "..", "spec", "fixtures", "kernel", "pactia-lang-website.pactia");
  if (!existsSync(specMonolith)) return;

  withVendorRoot(() => {
    const monolithSource = readFileSync(specMonolith, "utf8");
    const monolithResult = compile(monolithSource);
    const { files } = compileWorkspace(websiteRoot);

    const slices = [
      "product.yaml",
      "modules/marketing/marketing.module.yaml",
      "modules/marketing/marketing.model.yaml",
      "modules/marketing/services/site.service.yaml",
    ] as const;

    for (const relativePath of slices) {
      assert.equal(
        files.get(relativePath),
        monolithResult.files.get(relativePath),
        `Website workspace mismatch for ${relativePath}`,
      );
    }
  });
});

test("compileWorkspace fleet fixture matches monolith golden IR slices", () => {
  withVendorRoot(() => {
    const monolith = readTestFixture(TestFixtureId.FleetManagementV2);
    const monolithResult = compile(monolith);
    const { files } = compileWorkspace(fleetWorkspaceRoot);

    assert.deepEqual([...files.keys()].sort(), [...expectedFiles].sort());

    for (const relativePath of expectedFiles) {
      if (relativePath === "manifest.yaml") continue;
      assert.equal(files.get(relativePath), readExpected(relativePath), `Mismatch for ${relativePath}`);
      assert.equal(files.get(relativePath), monolithResult.files.get(relativePath));
    }

    const manifest = files.get("manifest.yaml");
    assert.ok(manifest?.includes("lockfileDigest:"));
    assert.ok(
      !manifest?.includes("0000000000000000000000000000000000000000000000000000000000000000"),
    );
  });
});
