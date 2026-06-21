import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePackageToml } from "./package-toml.js";

test("parsePackageToml reads package identity and deps", () => {
  const manifest = parsePackageToml(`
[package]
name = "@pactia/rust-stack"
version = "1.0.0"
description = "Rust / Actix platform macros"

[dependencies]
"@pactia/kernel" = "^1.0"
`);

  assert.equal(manifest.name, "@pactia/rust-stack");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.description, "Rust / Actix platform macros");
  assert.equal(manifest.dependencies.get("@pactia/kernel"), "^1.0");
});

test("parsePackageToml ignores unknown sections and legacy kind field", () => {
  const manifest = parsePackageToml(`
[package]
name = "@pactia/html-css-js"
version = "1.0.0"
kind = "surface"

[legacy]
ignored = "value"
`);

  assert.equal(manifest.name, "@pactia/html-css-js");
  assert.equal(manifest.description, undefined);
});
