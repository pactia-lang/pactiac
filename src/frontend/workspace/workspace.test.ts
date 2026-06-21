import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { compile, compileWorkspace } from "../../compile/compile.js";
import { compileSource } from "../../application/compile-source.js";
import { discoverWorkspace } from "./discover.js";
import { mergeWorkspaceSources } from "./merge.js";
import { assembleWorkspace } from "./assemble.js";
import {
  readTestFixture,
  repoRoot,
  TestFixtureId,
} from "../../../test/fixture-paths.js";

const relayWorkspaceRoot = join(repoRoot, "test/fixtures/workspace/relay");
const vendorRoot = join(repoRoot, "test/fixtures/packages");

const expectedFiles = [
  "input/workspace.json",
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

function compileRelayMonolithWithStackRegistry(source: string) {
  return compileSource({
    source,
    workspaceRoot: relayWorkspaceRoot,
    entryFile: "product.pactia",
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
    assert.ok(assembled.effectiveRegistry.macros.size >= 5);
    assert.ok(assembled.effectiveRegistry.macros.has("paginated"));
    assert.ok(assembled.effectiveRegistry.macros.has("list"));
    assert.ok(assembled.effectiveRegistry.macros.has("create"));
    assert.ok(assembled.effectiveRegistry.macros.has("idempotent"));
    assert.equal(
      assembled.effectiveRegistry.macros.get("paginated")?.source,
      "@pactia/rust-stack",
    );
  });
});

test("compileWorkspace relay fixture matches monolith without PACTIA_VENDOR_ROOT", () => {
  const { files } = compileWorkspace(relayWorkspaceRoot);
  const monolithResult = compileRelayMonolithWithStackRegistry(
    readTestFixture(TestFixtureId.Relay),
  );

  assert.deepEqual(
    [...files.keys()].sort(),
    [...monolithResult.files.keys()].sort(),
  );
});

test("compileWorkspace website example matches spec monolith IR slices", () => {
  const websiteRoot = join(repoRoot, "test/fixtures/workspace/website");
  if (
    !existsSync(join(websiteRoot, "pactia.toml")) ||
    !existsSync(join(websiteRoot, "pactia.lock"))
  ) {
    return;
  }

  withVendorRoot(() => {
    const { files } = compileWorkspace(websiteRoot);
    assert.ok(files.size > 0);
  });
});

test("compileWorkspace relay fixture emits golden file set", () => {
  withVendorRoot(() => {
    const { files } = compileWorkspace(relayWorkspaceRoot);
    assert.deepEqual([...files.keys()].sort(), [...expectedFiles].sort());
  });
});
