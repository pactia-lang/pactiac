import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TomlLockReader, readPactiaLock } from "./toml-lock-reader.js";

test("TomlLockReader returns undefined when lockfile missing", () => {
  const tmp = mkdtempSync(join(tmpdir(), "pactiac-tlr-"));
  try {
    const reader = new TomlLockReader();
    assert.equal(reader.read({ workspaceRoot: tmp }), undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("TomlLockReader reads valid lockfile", () => {
  const tmp = mkdtempSync(join(tmpdir(), "pactiac-tlr-"));
  try {
    writeFileSync(join(tmp, "pactia.lock"), 'lockVersion = 1\n\n[[package]]\nname = "@pactia/kernel"\nversion = "1.0.0"\ndigest = "sha256:abcd"\n', "utf8");
    const reader = new TomlLockReader();
    const result = reader.read({ workspaceRoot: tmp });
    assert.ok(result);
    assert.equal(result.packages[0]!.name, "@pactia/kernel");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("readPactiaLock parses lockfile source string", () => {
  const source = 'lockVersion = 1\n\n[[package]]\nname = "@pactia/kernel"\nversion = "1.0.0"\ndigest = "sha256:abcd"\n';
  const result = readPactiaLock(source);
  assert.ok(result);
  assert.equal(result.packages.length, 1);
  assert.equal(result.packages[0]!.name, "@pactia/kernel");
});
