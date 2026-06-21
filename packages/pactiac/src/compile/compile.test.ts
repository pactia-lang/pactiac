import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { compile } from "./compile.js";
import { compileSource } from "../application/compile-source.js";

const relayWorkspace = resolve(import.meta.dirname, "..", "..", "test/fixtures/workspace/relay");

test("compile accepts pactia 1.0 patch versions", () => {
  process.env["PACTIA_VENDOR_ROOT"] = resolve(import.meta.dirname, "..", "..", "test/fixtures/packages");
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
