import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../test/fixture-paths.js";

const cliPath = resolve(import.meta.dirname, "../dist/cli.js");
const repoRoot = resolve(import.meta.dirname, "../../..");
const relayFixture = resolve(repoRoot, "test/fixtures/kernel/relay.pactia");
const relayWorkspace = resolve(repoRoot, "test/fixtures/workspace/relay");
const vendorRoot = resolve(repoRoot, "test/fixtures/packages");

const compileEnv = {
  ...process.env,
  PACTIA_VENDOR_ROOT: vendorRoot,
  PACTIA_WORKSPACE_ROOT: relayWorkspace,
};

test("cli compile writes IR workspace files to output directory", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "pactiac-cli-"));
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "compile", "-i", relayFixture, "-o", outputDir],
      { encoding: "utf8", env: compileEnv },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /wrote input\/manifest\.json/);
    assert.match(readFileSync(join(outputDir, "input/manifest.json"), "utf8"), /"pactiaVersion": "1.0"/);
    assert.match(readFileSync(join(outputDir, "input/product.json"), "utf8"), /Relay/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("cli compile -w writes IR from multi-file workspace", () => {
  const workspaceRoot = resolve(repoRoot, "test/fixtures/workspace/relay");
  const outputDir = mkdtempSync(join(tmpdir(), "pactiac-cli-ws-"));
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "compile", "-w", workspaceRoot, "-o", outputDir],
      { encoding: "utf8", env: { ...process.env, PACTIA_VENDOR_ROOT: vendorRoot } },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /wrote input\/modules\/orders\/services\/order\.service\.json/);
    assert.match(readFileSync(join(outputDir, "input/manifest.json"), "utf8"), /"lockfileDigest": "sha256:/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("cli compile rejects missing required flags", () => {
  const result = spawnSync(process.execPath, [cliPath, "compile"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /-o <output-dir> is required/);
});

test("cli compile rejects both -i and -w", () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, "compile", "-i", relayFixture, "-w", ".", "-o", "/tmp/out"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exactly one of -i .* or -w/);
});

test("cli compile writes provenance report when requested", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "pactiac-cli-prov-"));
  const provenancePath = join(outputDir, "provenance.json");
  const sourcePath = join(outputDir, "input.pactia");
  try {
    const source = readTestFixture(TestFixtureId.Relay);
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
      { encoding: "utf8", env: compileEnv },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(provenancePath, "utf8")) as {
      diagnostics: Array<{ provenance: string; target: string }>;
    };
    assert.ok(Array.isArray(report.diagnostics));
    assert.match(result.stdout, /Provenance summary:/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
