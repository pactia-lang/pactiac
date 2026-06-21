import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { repoRoot } from "../../test/fixture-paths.js";
import { loadRegistryFromWorkspace } from "./fs-registry-loader.js";
import { parseSyntaxTree } from "../passes/parse/recursive-descent-parser.js";

const relayWorkspace = join(repoRoot, "test/fixtures/workspace/relay");
const relaySource = readFileSync(join(relayWorkspace, "product.pactia"), "utf8");

describe("FsRegistryLoader", () => {
  it("loads stack macros from index.pactia when vendor root is set", () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
    try {
      const syntax = parseSyntaxTree({ source: relaySource, entryFile: "product.pactia" });
      const registry = loadRegistryFromWorkspace(relayWorkspace, syntax);
      assert.ok(registry.macros.has("paginated"));
      assert.ok(registry.macros.has("list"));
      assert.equal(registry.macros.get("paginated")?.source, "@pactia/rust-anb");
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });

  it("filters registry entries for partial package imports", () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
    try {
      const partialSource = [
        "pactia 1.0",
        "import { #list } from @pactia/rust-anb;",
        "product Demo {",
        "  #rust_anb",
        "}",
      ].join("\n");
      const workspaceDir = join(repoRoot, "test/fixtures/workspace/relay");
      const syntax = parseSyntaxTree({ source: partialSource, entryFile: "product.pactia" });
      const registry = loadRegistryFromWorkspace(workspaceDir, syntax);
      assert.ok(registry.macros.has("list"));
      assert.equal(registry.macros.has("paginated"), false);
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });
});
