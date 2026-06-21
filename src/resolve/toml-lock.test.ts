import assert from "node:assert/strict";
import { test } from "node:test";
import { PackageResolutionError } from "./errors.js";
import { parsePactiaLockToml } from "./toml-lock.js";

test("parsePactiaLockToml reads Cargo-style package tables", () => {
  const lock = parsePactiaLockToml(`lockVersion = 1

[[package]]
name = "@pactia/rust-stack"
version = "1.0.0"
digest = "sha256:a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
`);
  assert.equal(lock.packages.length, 1);
  assert.equal(lock.packages[0]?.name, "@pactia/rust-stack");
});

test("parsePactiaLockToml rejects empty lockfiles", () => {
  assert.throws(
    () => parsePactiaLockToml("lockVersion = 1\n"),
    PackageResolutionError,
  );
});
