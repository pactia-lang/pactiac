import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { repoRoot } from "../../test/fixture-paths.js";
import { loadRegistryFromWorkspace, FsRegistryLoader } from "./fs-registry-loader.js";
import { parseSyntaxTree } from "../passes/parse/recursive-descent-parser.js";
import { DiagnosticCode } from "../domain/diagnostic-code.js";

const relayWorkspace = join(repoRoot, "test/fixtures/workspace/relay");
const relaySource = readFileSync(
  join(relayWorkspace, "product.pactia"),
  "utf8",
);

describe("FsRegistryLoader", () => {
  it("loads stack macros from index.pactia when vendor root is set", () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(
      repoRoot,
      "test/fixtures/packages",
    );
    try {
      const syntax = parseSyntaxTree({
        source: relaySource,
        entryFile: "product.pactia",
      });
      const registry = loadRegistryFromWorkspace(relayWorkspace, syntax);
      assert.ok(registry.macros.has("paginated"));
      assert.ok(registry.macros.has("list"));
      assert.equal(
        registry.macros.get("paginated")?.source,
        "@pactia/rust-stack",
      );
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });

  it("loads topology exports from vendored topology package", () => {
    const tmp = join(tmpdir(), `pactia-test-topo-${Date.now()}`);
    const wsDir = join(tmp, "ws");
    const pkgDir = join(wsDir, ".pactia", "packages", "@topo--demo@1.0.0");
    mkdirSync(pkgDir, { recursive: true });

    // Create pactia.toml + index.pactia with manifest + bare topology file
    writeFileSync(join(pkgDir, ".digest"), "sha256:abc", "utf8");
    writeFileSync(join(pkgDir, "pactia.toml"), '[package]\nname = "@topo/demo"\nversion = "1.0.0"\n', "utf8");
    writeFileSync(join(pkgDir, "index.pactia"), 'pactia 1.0\nexport "./commerce.module.pactia"\n', "utf8");
    writeFileSync(join(pkgDir, "commerce.module.pactia"), "export module commerce {\n  service Api { }\n}\n", "utf8");

    // Create consumer workspace with lock + toml
    writeFileSync(join(wsDir, "pactia.toml"), '[package]\nname = "test"\nversion = "1.0.0"\n\n[dependencies]\n"@topo/demo" = "^1.0"\n', "utf8");
    writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@topo/demo"\nversion = "1.0.0"\ndigest = "sha256:abc"\n', "utf8");

    try {
      const syntax = parseSyntaxTree({
        source: 'pactia 1.0\nimport { commerce } from @topo/demo;\nproduct X { module(commerce) { } }\n',
        entryFile: "product.pactia",
      });
      const registry = loadRegistryFromWorkspace(wsDir, syntax);
      assert.ok(registry.structuralExports.has("commerce"));
      assert.equal(registry.structuralExports.get("commerce")?.kind, "module");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits HYBRID_PACKAGE_DISCOURAGED warning for mixed-exports packages", () => {
    const tmp = join(tmpdir(), `pactia-test-hybrid-${Date.now()}`);
    const wsDir = join(tmp, "ws");
    const pkgDir = join(wsDir, ".pactia", "packages", "@hybrid--demo@1.0.0");
    mkdirSync(pkgDir, { recursive: true });

    writeFileSync(join(pkgDir, ".digest"), "sha256:abc", "utf8");
    writeFileSync(join(pkgDir, "pactia.toml"), '[package]\nname = "@hybrid/demo"\nversion = "1.0.0"\nmixed-exports = true\n', "utf8");
    writeFileSync(join(pkgDir, "index.pactia"), 'pactia 1.0\nexport def @api in service { }\nexport "./commerce.module.pactia"\n', "utf8");
    writeFileSync(join(pkgDir, "commerce.module.pactia"), "export module commerce { }", "utf8");

    writeFileSync(join(wsDir, "pactia.toml"), '[package]\nname = "test"\nversion = "1.0.0"\n\n[dependencies]\n"@hybrid/demo" = "^1.0"\n', "utf8");
    writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@hybrid/demo"\nversion = "1.0.0"\ndigest = "sha256:abc"\n', "utf8");

    try {
      const syntax = parseSyntaxTree({
        source: 'pactia 1.0\nimport { commerce } from @hybrid/demo;\nproduct X { module(commerce) { } }\n',
        entryFile: "product.pactia",
      });
      const registry = loadRegistryFromWorkspace(wsDir, syntax);
      const hybridDiags = registry.diagnostics.filter(
        (d) => d.code === DiagnosticCode.HybridPackageDiscouraged,
      );
      assert.equal(hybridDiags.length, 1);
      assert.match(hybridDiags[0]!.message, /HYBRID_PACKAGE_DISCOURAGED/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws TOPOLOGY_EXPORT_FILE_MISSING for missing manifest file", () => {
    const tmp = join(tmpdir(), `pactia-test-missing-${Date.now()}`);
    const wsDir = join(tmp, "ws");
    const pkgDir = join(wsDir, ".pactia", "packages", "@topo--missing@1.0.0");
    mkdirSync(pkgDir, { recursive: true });

    writeFileSync(join(pkgDir, ".digest"), "sha256:abc", "utf8");
    writeFileSync(join(pkgDir, "pactia.toml"), '[package]\nname = "@topo/missing"\nversion = "1.0.0"\n', "utf8");
    writeFileSync(join(pkgDir, "index.pactia"), 'pactia 1.0\nexport "./nonexistent.pactia"\n', "utf8");

    writeFileSync(join(wsDir, "pactia.toml"), '[package]\nname = "test"\nversion = "1.0.0"\n\n[dependencies]\n"@topo/missing" = "^1.0"\n', "utf8");
    writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@topo/missing"\nversion = "1.0.0"\ndigest = "sha256:abc"\n', "utf8");

    try {
      assert.throws(
        () => {
          const syntax = parseSyntaxTree({
            source: 'pactia 1.0\nimport { commerce } from @topo/missing;\nproduct X { module(commerce) { } }\n',
            entryFile: "product.pactia",
          });
          loadRegistryFromWorkspace(wsDir, syntax);
        },
        /TOPOLOGY_EXPORT_FILE_MISSING/,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws PACKAGE_PROFILE_MISMATCH for mismatched exports field", () => {
    const tmp = join(tmpdir(), `pactia-test-mismatch-${Date.now()}`);
    const wsDir = join(tmp, "ws");
    const pkgDir = join(wsDir, ".pactia", "packages", "@mismatch--pkg@1.0.0");
    mkdirSync(pkgDir, { recursive: true });

    writeFileSync(join(pkgDir, ".digest"), "sha256:abc", "utf8");
    // declares topology but has only registry exports
    writeFileSync(join(pkgDir, "pactia.toml"), '[package]\nname = "@mismatch/pkg"\nversion = "1.0.0"\nexports = "topology"\n', "utf8");
    writeFileSync(join(pkgDir, "index.pactia"), 'pactia 1.0\nexport def @api in service { }\n', "utf8");

    writeFileSync(join(wsDir, "pactia.toml"), '[package]\nname = "test"\nversion = "1.0.0"\n\n[dependencies]\n"@mismatch/pkg" = "^1.0"\n', "utf8");
    writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@mismatch/pkg"\nversion = "1.0.0"\ndigest = "sha256:abc"\n', "utf8");

    try {
      assert.throws(
        () => {
          const syntax = parseSyntaxTree({
            source: 'pactia 1.0\nimport @mismatch/pkg;\nproduct X { }',
            entryFile: "product.pactia",
          });
          loadRegistryFromWorkspace(wsDir, syntax);
        },
        /PACKAGE_PROFILE_MISMATCH/,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("filters registry entries for partial package imports", () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(
      repoRoot,
      "test/fixtures/packages",
    );
    try {
      const partialSource = [
        "pactia 1.0",
        "import { #list } from @pactia/rust-stack;",
        "product Demo {",
        "  #rust-stack",
        "}",
      ].join("\n");
      const workspaceDir = join(repoRoot, "test/fixtures/workspace/relay");
      const syntax = parseSyntaxTree({
        source: partialSource,
        entryFile: "product.pactia",
      });
      const registry = loadRegistryFromWorkspace(workspaceDir, syntax);
      assert.ok(registry.macros.has("list"));
      assert.equal(registry.macros.has("paginated"), false);
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });
});
