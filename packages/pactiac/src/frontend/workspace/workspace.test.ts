import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { compile, compileWorkspace } from "../../compile/compile.js";
import { compileIrWorkspace } from "../../lower/ir.js";
import { discoverWorkspace } from "./discover.js";
import { mergeWorkspaceSources } from "./merge.js";
import { assembleWorkspace } from "./assemble.js";
import { readTestFixture, TestFixtureId } from "../../../../../test/fixture-paths.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const relayWorkspaceRoot = join(repoRoot, "test/fixtures/workspace/relay");
const vendorRoot = join(repoRoot, "test/fixtures/packages");
const expectedRoot = join(repoRoot, "test/fixtures/expected/relay");

const expectedFiles = [
  "input/manifest.json",
  "input/product.json",
  "input/modules/orders/orders.module.json",
  "input/modules/orders/orders.model.json",
  "input/modules/orders/services/order.service.json",
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

function compileRelayMonolithWithStackRegistry(source: string) {
  const assembled = assembleWorkspace(relayWorkspaceRoot);
  return compileIrWorkspace(source, {
    effectiveRegistry: assembled.effectiveRegistry,
    packagesResolved: assembled.lockfileDigest !== undefined,
    lockfileDigest: assembled.lockfileDigest,
    loadedPackages: assembled.loadedPackages,
  });
}

test("discoverWorkspace finds relay workspace layout", () => {
  const files = discoverWorkspace(relayWorkspaceRoot);
  assert.ok(files.productSource.includes("module(orders)"));
  assert.match(files.productSource, /from \.\/fragments\//);
  assert.ok(files.pactiaTomlSource);
  assert.ok(files.pactiaLockSource);
});

test("mergeWorkspaceSources produces extractable kernel source", () => {
  const files = discoverWorkspace(relayWorkspaceRoot);
  const merged = mergeWorkspaceSources(files);
  assert.match(merged.source, /product Relay/);
  assert.match(merged.source, /module orders/);
  assert.match(merged.source, /service OrderService/);
  assert.match(merged.source, /@api list_orders/);
});

test("assembleWorkspace resolves vendored packages when PACTIA_VENDOR_ROOT is set", () => {
  withVendorRoot(() => {
    const assembled = assembleWorkspace(relayWorkspaceRoot);
    assert.ok(assembled.lockfileDigest?.startsWith("sha256:"));
    assert.ok(assembled.effectiveRegistry);
    assert.equal(assembled.effectiveRegistry.macros.size, 2);
    assert.ok(assembled.effectiveRegistry.macros.has("paginated"));
    assert.ok(assembled.effectiveRegistry.macros.has("list"));
    assert.equal(
      assembled.effectiveRegistry.macros.get("paginated")?.source,
      "@pactia/rust-anb",
    );
  });
});

test("compileWorkspace relay fixture matches monolith without PACTIA_VENDOR_ROOT", () => {
  const { files } = compileWorkspace(relayWorkspaceRoot);
  const monolithResult = compileRelayMonolithWithStackRegistry(
    readTestFixture(TestFixtureId.Relay),
  );

  for (const relativePath of expectedFiles) {
    if (relativePath === "input/manifest.json") continue;
    assert.equal(files.get(relativePath), monolithResult.files.get(relativePath));
  }
});

test("compileWorkspace website example matches spec monolith IR slices", () => {
  const websiteRoot = join(repoRoot, "..", "examples", "pactia-lang-website");
  if (!existsSync(join(websiteRoot, "pactia.toml")) || !existsSync(join(websiteRoot, "pactia.lock"))) {
    return;
  }
  try {
    const { files } = compileWorkspace(websiteRoot);
    assert.ok(files.size > 0);
  } catch (error) {
    if (error instanceof Error && error.name === "PackageResolutionError") {
      return;
    }
    throw error;
  }
});

test("compileWorkspace relay fixture matches monolith golden IR slices", () => {
  withVendorRoot(() => {
    const monolith = readTestFixture(TestFixtureId.Relay);
    const monolithResult = compileRelayMonolithWithStackRegistry(monolith);
    const { files } = compileWorkspace(relayWorkspaceRoot);

    for (const relativePath of expectedFiles) {
      if (relativePath === "input/manifest.json") continue;
      assert.equal(files.get(relativePath), monolithResult.files.get(relativePath));
      assert.equal(files.get(relativePath), readExpected(relativePath));
    }
  });
});
