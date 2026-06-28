import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { compile, compileWorkspace } from "../../compile/compile.js";
import { compileSource } from "../../application/compile-source.js";
import { discoverWorkspace } from "./discover.js";
import { mergeWorkspaceSources } from "./merge.js";
import { assembleWorkspace } from "./assemble.js";
import type { WorkspaceFiles } from "./types.js";
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

test("discoverWorkspace throws when product.pactia missing", () => {
  const tmp = join(tmpdir(), `pactia-test-discover-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  try {
    assert.throws(
      () => discoverWorkspace(tmp),
      /has no product/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("mergeWorkspaceSources — non-attach inline module path", () => {
  const productSource = [
    "pactia 1.0",
    "import @pactia/kernel;",
    "",
    "product InlineDemo {",
    "  module shop {",
    "    service OrderApi {",
    "      @api list { method: GET, path: \"/orders\" }",
    "    }",
    "  }",
    "}",
  ].join("\n");

  const files: WorkspaceFiles = {
    rootDir: "/tmp/mock",
    productPath: "/tmp/mock/product.pactia",
    productSource,
    pactiaTomlPath: undefined,
    pactiaTomlSource: undefined,
    pactiaLockPath: undefined,
    pactiaLockSource: undefined,
    modules: [],
  };

  const merged = mergeWorkspaceSources(files);
  assert.match(merged.source, /product InlineDemo/);
  assert.match(merged.source, /@api list/);
  assert.equal(merged.entry, "product.pactia");
});

test("assembleWorkspace emits PACKAGE_IMPORT_MIXED for mixed * and topology import", () => {
  const tmp = join(tmpdir(), `pactia-test-mixedimport-${Date.now()}`);
  const wsDir = join(tmp, "ws");
  const pkgDir = join(wsDir, ".pactia", "packages", "@hybrid--kit@1.0.0");
  mkdirSync(pkgDir, { recursive: true });

  writeFileSync(join(pkgDir, ".digest"), "sha256:abc", "utf8");
  writeFileSync(join(pkgDir, "pactia.toml"), '[package]\nname = "@hybrid/kit"\nversion = "1.0.0"\nmixed-exports = true\n', "utf8");
  writeFileSync(join(pkgDir, "index.pactia"), 'pactia 1.0\nexport def @api in service { }\nexport "./commerce.module.pactia"\n', "utf8");
  writeFileSync(join(pkgDir, "commerce.module.pactia"), "export module commerce { }", "utf8");

  writeFileSync(join(wsDir, "pactia.toml"), '[package]\nname = "test"\nversion = "1.0.0"\n\n[dependencies]\n"@hybrid/kit" = "^1.0"\n', "utf8");
  writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@hybrid/kit"\nversion = "1.0.0"\ndigest = "sha256:abc"\n', "utf8");
  writeFileSync(join(wsDir, "product.pactia"), 'pactia 1.0\nimport { *, commerce } from @hybrid/kit;\nproduct X { module(commerce) { } }\n');

  try {
    const assembled = assembleWorkspace(wsDir);
    const mixedDiags = (assembled.merged.diagnostics ?? []).filter(
      (d) => d.code === "PACKAGE_IMPORT_MIXED" as any,
    );
    assert.equal(mixedDiags.length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("assembleWorkspace throws TOPOLOGY_WILDCARD_FORBIDDEN for bare import from topology package", () => {
  const tmp = join(tmpdir(), `pactia-test-topowild-${Date.now()}`);
  const wsDir = join(tmp, "ws");
  const pkgDir = join(wsDir, ".pactia", "packages", "@topo--only@1.0.0");
  mkdirSync(pkgDir, { recursive: true });

  writeFileSync(join(pkgDir, ".digest"), "sha256:abc", "utf8");
  writeFileSync(join(pkgDir, "pactia.toml"), '[package]\nname = "@topo/only"\nversion = "1.0.0"\n', "utf8");
  writeFileSync(join(pkgDir, "index.pactia"), 'pactia 1.0\nexport "./commerce.module.pactia"\n', "utf8");
  writeFileSync(join(pkgDir, "commerce.module.pactia"), "export module commerce { }", "utf8");

  writeFileSync(join(wsDir, "pactia.toml"), '[package]\nname = "test"\nversion = "1.0.0"\n\n[dependencies]\n"@topo/only" = "^1.0"\n', "utf8");
  writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@topo/only"\nversion = "1.0.0"\ndigest = "sha256:abc"\n', "utf8");
  writeFileSync(join(wsDir, "product.pactia"), 'pactia 1.0\nimport @topo/only;\nproduct X { }\n');

  try {
    assert.throws(
      () => assembleWorkspace(wsDir),
      /TOPOLOGY_WILDCARD_FORBIDDEN/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("assembleWorkspace inlines topology export bodies into merged source", () => {
  const tmp = join(tmpdir(), `pactia-test-inline-${Date.now()}`);
  const wsDir = join(tmp, "ws");
  const pkgDir = join(wsDir, ".pactia", "packages", "@topo--inline@1.0.0");
  mkdirSync(pkgDir, { recursive: true });

  writeFileSync(join(pkgDir, ".digest"), "sha256:abc", "utf8");
  writeFileSync(join(pkgDir, "pactia.toml"), '[package]\nname = "@topo/inline"\nversion = "1.0.0"\n', "utf8");
  writeFileSync(join(pkgDir, "index.pactia"), 'pactia 1.0\nexport "./commerce.module.pactia"\n', "utf8");
  writeFileSync(join(pkgDir, "commerce.module.pactia"), "export module commerce {\n  @api list_orders { method: GET }\n}\n", "utf8");

  writeFileSync(join(wsDir, "pactia.toml"), '[package]\nname = "test"\nversion = "1.0.0"\n\n[dependencies]\n"@topo/inline" = "^1.0"\n', "utf8");
  writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@topo/inline"\nversion = "1.0.0"\ndigest = "sha256:abc"\n', "utf8");
  writeFileSync(join(wsDir, "product.pactia"), 'pactia 1.0\nimport { commerce } from @topo/inline;\nproduct X { module(commerce) { } }\n');

  try {
    const assembled = assembleWorkspace(wsDir);
    assert.match(assembled.merged.source, /export module commerce/);
    assert.match(assembled.merged.source, /@api list_orders/);
    // Verify the import line was replaced with inlined topology
    assert.equal(assembled.merged.source.includes("import { commerce } from @topo/inline"), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("assembleWorkspace throws EXPORT_NOT_DECLARED for undeclared topology symbol", () => {
  const tmp = join(tmpdir(), `pactia-test-exportmissing-${Date.now()}`);
  const wsDir = join(tmp, "ws");
  const pkgDir = join(wsDir, ".pactia", "packages", "@topo--only2@1.0.0");
  mkdirSync(pkgDir, { recursive: true });

  writeFileSync(join(pkgDir, ".digest"), "sha256:abc", "utf8");
  writeFileSync(join(pkgDir, "pactia.toml"), '[package]\nname = "@topo/only2"\nversion = "1.0.0"\n', "utf8");
  writeFileSync(join(pkgDir, "index.pactia"), 'pactia 1.0\nexport "./commerce.module.pactia"\n', "utf8");
  writeFileSync(join(pkgDir, "commerce.module.pactia"), "export module commerce { }", "utf8");

  writeFileSync(join(wsDir, "pactia.toml"), '[package]\nname = "test"\nversion = "1.0.0"\n\n[dependencies]\n"@topo/only2" = "^1.0"\n', "utf8");
  writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@topo/only2"\nversion = "1.0.0"\ndigest = "sha256:abc"\n', "utf8");
  writeFileSync(join(wsDir, "product.pactia"), 'pactia 1.0\nimport { nonexistent } from @topo/only2;\nproduct X { }\n');

  try {
    assert.throws(
      () => assembleWorkspace(wsDir),
      /EXPORT_NOT_DECLARED/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
