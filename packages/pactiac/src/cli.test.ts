import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../test/fixture-paths.js";

const cliPath = resolve(import.meta.dirname, "../dist/cli.js");
const fleetFixture = resolve(import.meta.dirname, "../../../test/fixtures/kernel/fleet-management-v2.pactia");

test("cli compile writes IR workspace files to output directory", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "pactiac-cli-"));
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "compile", "-i", fleetFixture, "-o", outputDir],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /wrote manifest\.yaml/);
    assert.match(readFileSync(join(outputDir, "manifest.yaml"), "utf8"), /pactiaVersion: "1.0"/);
    assert.match(readFileSync(join(outputDir, "product.yaml"), "utf8"), /FleetManagement/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("cli compile rejects missing required flags", () => {
  const result = spawnSync(process.execPath, [cliPath, "compile"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /both -i .* and -o .* are required/);
});

test("cli compile writes provenance report when requested", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "pactiac-cli-prov-"));
  const provenancePath = join(outputDir, "provenance.json");
  const sourcePath = join(outputDir, "input.pactia");
  try {
    const source = readTestFixture(TestFixtureId.FleetManagementV2);
    writeFileSync(sourcePath, source, "utf8");

    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "compile",
        "-i",
        sourcePath,
        "-o",
        join(outputDir, "ir"),
        "--provenance",
        provenancePath,
        "--report",
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(provenancePath, "utf8")) as {
      diagnostics: Array<{ provenance: string; target: string }>;
    };
    assert.ok(Array.isArray(report.diagnostics));
    assert.ok(report.diagnostics.length > 0);
    assert.match(result.stdout, /Provenance summary:/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
