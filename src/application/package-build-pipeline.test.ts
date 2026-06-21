import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { PackageBuildPipeline } from "./package-build-pipeline.js";
import { DiagnosticCode } from "../domain/diagnostic-code.js";

describe("PackageBuildPipeline", () => {
  it("writes pactia.package.json from index.pactia export defs", () => {
    const root = mkdtempSync(join(tmpdir(), "pactia-pkg-build-"));
    try {
      writeFileSync(
        join(root, "pactia.package.json"),
        `${JSON.stringify({
          name: "@pactia/rust-anb",
          version: "1.0.0",
          kind: "stack",
          registry: { tags: [], macros: [] },
        })}\n`,
      );
      writeFileSync(
        join(root, "index.pactia"),
        [
          "pactia 1.0",
          "export def #paginated in service {",
          "  modifiers.pageSize: 50,",
          "}",
          "export def #list in service {",
          "  #paginated",
          "}",
        ].join("\n"),
      );

      const result = new PackageBuildPipeline().build({ packageRoot: root });
      assert.equal(result.diagnostics.length, 0);

      const manifest = JSON.parse(readFileSync(join(root, "pactia.package.json"), "utf8")) as {
        registry: { macros: Array<{ name: string; expandsTo: string[] }> };
      };
      assert.equal(manifest.registry.macros.length, 2);
      assert.deepEqual(
        manifest.registry.macros.map((macro) => macro.name),
        ["paginated", "list"],
      );
      assert.deepEqual(manifest.registry.macros[1]?.expandsTo, ["#paginated"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports missing index.pactia", () => {
    const root = mkdtempSync(join(tmpdir(), "pactia-pkg-build-"));
    try {
      const result = new PackageBuildPipeline().build({ packageRoot: root });
      assert.equal(result.diagnostics[0]?.code, DiagnosticCode.ParseError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
