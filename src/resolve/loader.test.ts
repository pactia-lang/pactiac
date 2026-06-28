import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { hashDirectoryMarker, loadVendoredPackage } from "./loader.js";
import { PackageResolutionError } from "./errors.js";
import type { PactiaLockManifest } from "./manifest.js";

test("hashDirectoryMarker uses .digest file when present", () => {
  const dir = join(tmpdir(), `pactia-test-loader-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, ".digest"), "sha256:abc123", "utf8");
    const result = hashDirectoryMarker(dir);
    assert.equal(result, "sha256:abc123");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hashDirectoryMarker computes from pactia.toml + index.pactia", () => {
  const dir = join(tmpdir(), `pactia-test-loader-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "pactia.toml"), 'name = "@test/pkg"\nversion = "1.0.0"', "utf8");
    writeFileSync(join(dir, "index.pactia"), "pactia 1.0\nexport def @api in service { }", "utf8");
    const result = hashDirectoryMarker(dir);
    assert.ok(result.startsWith("sha256:"));
    assert.equal(result.length, 71);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hashDirectoryMarker handles missing optional files", () => {
  const dir = join(tmpdir(), `pactia-test-loader-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    // No pactia.toml or index.pactia — should still compute a hash
    const result = hashDirectoryMarker(dir);
    assert.ok(result.startsWith("sha256:"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadVendoredPackage throws on digest mismatch", () => {
  const tmp = join(tmpdir(), `pactia-test-loader-${Date.now()}`);
  const pkgDir = join(tmp, ".pactia", "packages", "@pactia--kernel@1.0.0");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, ".digest"), "sha256:wrong", "utf8");
  writeFileSync(join(pkgDir, "pactia.toml"), "name = \"test\"", "utf8");
  try {
    assert.throws(
      () =>
        loadVendoredPackage(tmp, "@pactia/kernel", {
          name: "@pactia/kernel",
          version: "1.0.0",
          digest: "sha256:correct",
        }),
      PackageResolutionError,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("hashDirectoryMarker includes manifest-referenced topology files", () => {
  const dir = join(tmpdir(), `pactia-test-loader-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "pactia.toml"), 'name = "@test/pkg"\nversion = "1.0.0"', "utf8");
    writeFileSync(join(dir, "index.pactia"), 'pactia 1.0\nexport "./commerce.module.pactia"\nexport "./orders.service.pactia"', "utf8");
    writeFileSync(join(dir, "commerce.module.pactia"), "export module commerce { }", "utf8");
    writeFileSync(join(dir, "orders.service.pactia"), "export service OrderService { }", "utf8");
    const result = hashDirectoryMarker(dir);
    assert.ok(result.startsWith("sha256:"));
    assert.equal(result.length, 71);
    // Hash should be different from one without manifest files
    writeFileSync(join(dir, "index.pactia"), "pactia 1.0\nexport def @api in service { }", "utf8");
    const result2 = hashDirectoryMarker(dir);
    assert.notEqual(result, result2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hashDirectoryMarker handles missing manifest files gracefully", () => {
  const dir = join(tmpdir(), `pactia-test-loader-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "pactia.toml"), 'name = "@test/pkg"\nversion = "1.0.0"', "utf8");
    // Reference a manifest file that doesn't exist — should use empty string
    writeFileSync(join(dir, "index.pactia"), 'pactia 1.0\nexport "./missing.pactia"', "utf8");
    const result = hashDirectoryMarker(dir);
    assert.ok(result.startsWith("sha256:"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadVendoredPackage throws when package not found", () => {
  const tmp = join(tmpdir(), `pactia-test-loader-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  try {
    assert.throws(
      () =>
        loadVendoredPackage(tmp, "@missing/pkg", {
          name: "@missing/pkg",
          version: "1.0.0",
          digest: "sha256:abc",
        }),
      PackageResolutionError,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});