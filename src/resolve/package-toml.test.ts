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

test("parsePackageToml reads mixed-exports opt-in", () => {
  const manifest = parsePackageToml(`
[package]
name = "@acme/kit"
version = "1.0.0"
mixed-exports = true
`);
  assert.equal(manifest.mixedExports, true);
});

test("parsePackageToml defaults mixed-exports to false", () => {
  const manifest = parsePackageToml(`
[package]
name = "@acme/kit"
version = "1.0.0"
`);
  assert.equal(manifest.mixedExports, false);
});

test("parsePackageToml reads exports field", () => {
  const manifest = parsePackageToml(`
[package]
name = "@acme/topology"
version = "1.0.0"
exports = "topology"
`);
  assert.equal(manifest.exports, "topology");
});

test("parsePackageToml defaults exports to undefined", () => {
  const manifest = parsePackageToml(`
[package]
name = "@acme/registry"
version = "1.0.0"
`);
  assert.equal(manifest.exports, undefined);
});
