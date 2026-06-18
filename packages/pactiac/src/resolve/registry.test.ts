import assert from "node:assert/strict";
import { test } from "node:test";
import type { LoadedPackage } from "./loader.js";
import {
  RegistryError,
  RegistryErrorCode,
  RegistryMacroTier,
  buildEffectiveRegistry,
  parsePackageMacros,
} from "./registry.js";

function stubPackage(
  coordinate: string,
  manifestSource: string | undefined,
): LoadedPackage {
  return {
    coordinate,
    version: "1.0.0",
    digest: "sha256:abc",
    rootDir: "/tmp",
    manifestSource,
  };
}

test("parsePackageMacros reads registry.macros expands_to", () => {
  const macros = parsePackageMacros(
    `registry:
  macros:
    - name: paginated
      version: 1
      expands_to:
        - "modifiers.pageSize: 50"
        - "modifiers.paginated: true"`,
    "@pactia/rust-anb",
    RegistryMacroTier.Stack,
  );
  assert.equal(macros.length, 1);
  assert.equal(macros[0]?.name, "paginated");
  assert.deepEqual(macros[0]?.expandsTo, [
    "modifiers.pageSize: 50",
    "modifiers.paginated: true",
  ]);
});

test("buildEffectiveRegistry applies stack over std import", () => {
  const registry = buildEffectiveRegistry({
    stackCoordinate: "@pactia/rust-anb",
    importCoordinates: ["@pactia/api-patterns", "@pactia/protocol-rest"],
    loaded: [
      stubPackage(
        "@pactia/api-patterns",
        `registry:
  macros:
    - name: paginated
      expands_to:
        - "modifiers.pageSize: 20"`,
      ),
      stubPackage("@pactia/protocol-rest", undefined),
      stubPackage(
        "@pactia/rust-anb",
        `registry:
  macros:
    - name: paginated
      expands_to:
        - "modifiers.pageSize: 50"
        - "modifiers.paginated: true"`,
      ),
    ],
  });

  const paginated = registry.macros.get("paginated");
  assert.equal(paginated?.source, "@pactia/rust-anb");
  assert.equal(paginated?.tier, RegistryMacroTier.Stack);
  assert.deepEqual(paginated?.expandsTo, [
    "modifiers.pageSize: 50",
    "modifiers.paginated: true",
  ]);
});

test("buildEffectiveRegistry rejects import macro collisions", () => {
  assert.throws(
    () =>
      buildEffectiveRegistry({
        stackCoordinate: "@pactia/rust-anb",
        importCoordinates: ["@pactia/pkg-a", "@pactia/pkg-b"],
        loaded: [
          stubPackage(
            "@pactia/pkg-a",
            `registry:
  macros:
    - name: list
      expands_to:
        - "#[paginated]"`,
          ),
          stubPackage(
            "@pactia/pkg-b",
            `registry:
  macros:
    - name: list
      expands_to:
        - "#[detail]"`,
          ),
          stubPackage("@pactia/rust-anb", undefined),
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof RegistryError);
      assert.equal(error.code, RegistryErrorCode.RegistryCollision);
      return true;
    },
  );
});
