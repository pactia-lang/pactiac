import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizePackageCoordinate,
  lockfileDigest,
  assertImportsDeclared,
  assertLockEntries,
} from "./manifest.js";
import { PackageResolutionError } from "./errors.js";

test("normalizePackageCoordinate expands short names", () => {
  assert.equal(normalizePackageCoordinate("@pactia/kernel"), "@pactia/kernel");
  assert.equal(normalizePackageCoordinate("kernel"), "@pactia/kernel");
  assert.equal(normalizePackageCoordinate("rust-stack"), "@pactia/rust-stack");
  assert.equal(normalizePackageCoordinate("@github.com/org/repo"), "@github.com/org/repo");
});

test("lockfileDigest produces sha256 prefix", () => {
  const digest = lockfileDigest("hello");
  assert.ok(digest.startsWith("sha256:"));
  assert.equal(digest.length, 71); // "sha256:" + 64 hex chars
});

test("lockfileDigest is deterministic", () => {
  const a = lockfileDigest("same input");
  const b = lockfileDigest("same input");
  assert.equal(a, b);
});

test("assertImportsDeclared rejects undeclared imports", () => {
  assert.throws(
    () => assertImportsDeclared(["@missing/pkg"], { dependencies: new Map() }),
    PackageResolutionError,
  );

  assert.throws(
    () =>
      assertImportsDeclared(
        ["@pactia/kernel"],
        { dependencies: new Map([["@other/pkg", "^1.0"]]) },
      ),
    PackageResolutionError,
  );
});

test("assertImportsDeclared passes when all declared", () => {
  assert.doesNotThrow(() =>
    assertImportsDeclared(["@pactia/kernel"], {
      dependencies: new Map([["@pactia/kernel", "^1.0"]]),
    }),
  );
});

test("assertLockEntries rejects missing lock entries", () => {
  assert.throws(
    () =>
      assertLockEntries(["@pactia/kernel"], {
        packages: [],
      }),
    PackageResolutionError,
  );
});

test("assertLockEntries passes when entries present", () => {
  assert.doesNotThrow(() =>
    assertLockEntries(["@pactia/kernel"], {
      packages: [
        { name: "@pactia/kernel", version: "1.0.0", digest: "sha256:abc" },
      ],
    }),
  );
});