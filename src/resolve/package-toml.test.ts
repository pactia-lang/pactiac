import assert from "node:assert/strict";
import { test } from "node:test";
import { PackageKind } from "./package-kind.js";
import { parsePackageToml } from "./package-toml.js";

test("parsePackageToml reads package identity and deps", () => {
  const manifest = parsePackageToml(`
[package]
name = "@pactia/rust-anb"
version = "1.0.0"
kind = "stack"

[dependencies]
"@pactia/kernel" = "^1.0"
`);

  assert.equal(manifest.name, "@pactia/rust-anb");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.kind, PackageKind.Stack);
  assert.equal(manifest.dependencies.get("@pactia/kernel"), "^1.0");
});

test("parsePackageToml reads protocol wire schema", () => {
  const manifest = parsePackageToml(`
[package]
name = "@pactia/protocol-rest"
version = "1.0.0"
kind = "protocol"

[protocol]
wire-schema = "schemas/api-wire-v1.json"
`);

  assert.equal(manifest.kind, PackageKind.Protocol);
  assert.equal(manifest.wireSchema, "schemas/api-wire-v1.json");
});
