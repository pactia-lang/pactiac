import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { repoRoot } from "../../test/fixture-paths.js";
import { compile, workspaceRootForInput } from "./compile.js";
import { compileSource } from "../application/compile-source.js";

const relayWorkspace = join(repoRoot, "test/fixtures/workspace/relay");

test("compile accepts pactia 1.0 patch versions", () => {
  process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
  const result = compileSource({
    source: `pactia 1.0.1
product X {
  module m {
    service S {
    }
  }
}`,
    workspaceRoot: relayWorkspace,
    entryFile: "product.pactia",
  });
  assert.ok(result.files.size > 0);
});

test("workspaceRootForInput finds pactia.lock in parent directory", () => {
  const tmp = join(tmpdir(), `pactia-test-compile-${Date.now()}`);
  const subDir = join(tmp, "sub");
  mkdirSync(subDir, { recursive: true });
  try {
    // lock + product.pactia in same dir; function walks up from product.pactia's dirname
    writeFileSync(join(subDir, "pactia.lock"), "lockVersion = 1\n", "utf8");
    const inputFile = join(subDir, "product.pactia");
    writeFileSync(inputFile, "pactia 1.0\nproduct X { }", "utf8");

    const root = workspaceRootForInput(inputFile);
    assert.equal(root, subDir);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("workspaceRootForInput falls back to cwd when no lock found", () => {
  const tmp = join(tmpdir(), `pactia-test-compile-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  try {
    const inputFile = join(tmp, "product.pactia");
    writeFileSync(inputFile, "pactia 1.0\nproduct X { }", "utf8");

    const root = workspaceRootForInput(inputFile);
    assert.ok(typeof root === "string" && root.length > 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("compile throws on unsupported pactia version", () => {
  assert.throws(
    () => compile("pactia 2.0\nproduct X { }"),
    Error,
  );
});

test("compile function with explicit workspaceRoot", () => {
  const saved = process.env["PACTIA_VENDOR_ROOT"];
  process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
  try {
    const result = compile(
      `pactia 1.0
import @pactia/kernel;

product CompileFnTest {
  module m {
    service S {
      @api test { method: GET, path: "/test" }
    }
  }
}`,
      relayWorkspace,
    );
    assert.ok(result.files.size > 0);
  } finally {
    if (saved) process.env["PACTIA_VENDOR_ROOT"] = saved;
    else delete process.env["PACTIA_VENDOR_ROOT"];
  }
});
