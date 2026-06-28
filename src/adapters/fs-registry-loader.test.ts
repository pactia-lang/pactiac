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

  it("resolves kernel symbols transitively when consumer only imports rust-stack", async () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
    try {
      const source = [
        "pactia 1.0",
        "import @pactia/rust-stack;",
        "product Test {",
        "  @topology { mode: microservices }",
        "}",
      ].join("\n");
      const tree = parseSyntaxTree({ source, entryFile: "test.pactia" });

      // Use loadRegistryFromWorkspace (same pattern as other tests)
      const registry = loadRegistryFromWorkspace(relayWorkspace, tree);

      // Kernel symbols should be available through transitive resolution
      assert.ok(registry.tags.has("topology"), "expected @topology from kernel transitively");
      assert.ok(registry.tags.has("stack"), "expected @stack from kernel transitively");
      assert.ok(registry.tags.has("api"), "expected @api from kernel transitively");
      assert.ok(registry.macros.has("rust-stack"), "expected #rust-stack from rust-stack directly");
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });

  it("throws REGISTRY_COLLISION when two packages export the same tag name", () => {
    const tmp = join(tmpdir(), `pactia-test-collision-${Date.now()}`);
    const wsDir = join(tmp, "workspace");
    const vendorDir = join(wsDir, ".pactia", "packages");
    mkdirSync(vendorDir, { recursive: true });

    // Package A: exports @shared_tag
    const aDir = join(vendorDir, "@test--collision-a@1.0.0");
    mkdirSync(aDir, { recursive: true });
    writeFileSync(join(aDir, "pactia.toml"), '[package]\nname = "@test/collision-a"\nversion = "1.0.0"\n');
    writeFileSync(join(aDir, "index.pactia"), "pactia 1.0\nexport def @shared_tag in product { }\n");
    writeFileSync(join(aDir, ".digest"), "sha256:aaa");

    // Package B: also exports @shared_tag
    const bDir = join(vendorDir, "@test--collision-b@1.0.0");
    mkdirSync(bDir, { recursive: true });
    writeFileSync(join(bDir, "pactia.toml"), '[package]\nname = "@test/collision-b"\nversion = "1.0.0"\n');
    writeFileSync(join(bDir, "index.pactia"), "pactia 1.0\nexport def @shared_tag in product { }\n");
    writeFileSync(join(bDir, ".digest"), "sha256:bbb");

    // Consumer imports both → collision
    writeFileSync(join(wsDir, "pactia.toml"), '[dependencies]\n"@test/collision-a" = "^1.0"\n"@test/collision-b" = "^1.0"\n');
    writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@test/collision-a"\nversion = "1.0.0"\ndigest = "sha256:aaa"\n\n[[package]]\nname = "@test/collision-b"\nversion = "1.0.0"\ndigest = "sha256:bbb"\n');

    const source = "pactia 1.0\nimport @test/collision-a;\nimport @test/collision-b;\nproduct Test { }\n";
    const tree = parseSyntaxTree({ source, entryFile: "test.pactia" });

    assert.throws(
      () => loadRegistryFromWorkspace(wsDir, tree),
      /REGISTRY_COLLISION.*shared_tag/,
    );

    rmSync(tmp, { recursive: true, force: true });
  });

  it("does not throw collision for same tag from same source", () => {
    // A package exporting a tag and another package transitively importing
    // the same package should not collide because source is the same.
    const tmp = join(tmpdir(), `pactia-test-same-source-${Date.now()}`);
    const wsDir = join(tmp, "workspace");
    const vendorDir = join(wsDir, ".pactia", "packages");
    mkdirSync(vendorDir, { recursive: true });

    // Base package: exports @shared
    const baseDir = join(vendorDir, "@test--base@1.0.0");
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(join(baseDir, "pactia.toml"), '[package]\nname = "@test/base"\nversion = "1.0.0"\n');
    writeFileSync(join(baseDir, "index.pactia"), "pactia 1.0\nexport def @shared in product { }\n");
    writeFileSync(join(baseDir, ".digest"), "sha256:xxx");

    // Wrapper: imports base (no conflicting exports)
    const wrapDir = join(vendorDir, "@test--wrapper@1.0.0");
    mkdirSync(wrapDir, { recursive: true });
    writeFileSync(join(wrapDir, "pactia.toml"), '[package]\nname = "@test/wrapper"\nversion = "1.0.0"\n\n[dependencies]\n"@test/base" = "^1.0"\n');
    writeFileSync(join(wrapDir, "index.pactia"), "pactia 1.0\nimport @test/base;\n");
    writeFileSync(join(wrapDir, ".digest"), "sha256:yyy");

    // Consumer imports wrapper → base comes transitively. Same source, no collision.
    writeFileSync(join(wsDir, "pactia.toml"), '[dependencies]\n"@test/wrapper" = "^1.0"\n"@test/base" = "^1.0"\n');
    writeFileSync(join(wsDir, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@test/base"\nversion = "1.0.0"\ndigest = "sha256:xxx"\n\n[[package]]\nname = "@test/wrapper"\nversion = "1.0.0"\ndigest = "sha256:yyy"\n');

    const source = "pactia 1.0\nimport @test/wrapper;\nimport @test/base;\nproduct Test { }\n";
    const tree = parseSyntaxTree({ source, entryFile: "test.pactia" });

    // Should NOT throw — @shared from @test/base has the same source
    assert.doesNotThrow(() => loadRegistryFromWorkspace(wsDir, tree));

    rmSync(tmp, { recursive: true, force: true });
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
