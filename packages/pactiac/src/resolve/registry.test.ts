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
    indexSource: undefined,
  };
}

test("parsePackageMacros reads registry.macros expandsTo", () => {
  const macros = parsePackageMacros(
    JSON.stringify({
      registry: {
        macros: [
          {
            name: "paginated",
            version: 1,
            expandsTo: ["modifiers.pageSize: 50", "modifiers.paginated: true"],
          },
        ],
      },
    }),
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
        JSON.stringify({
          registry: {
            macros: [{ name: "paginated", expandsTo: ["modifiers.pageSize: 20"] }],
          },
        }),
      ),
      stubPackage("@pactia/protocol-rest", undefined),
      stubPackage(
        "@pactia/rust-anb",
        JSON.stringify({
          registry: {
            macros: [
              {
                name: "paginated",
                expandsTo: ["modifiers.pageSize: 50", "modifiers.paginated: true"],
              },
            ],
          },
        }),
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
            JSON.stringify({
              registry: { macros: [{ name: "list", expandsTo: ["#[paginated]"] }] },
            }),
          ),
          stubPackage(
            "@pactia/pkg-b",
            JSON.stringify({
              registry: { macros: [{ name: "list", expandsTo: ["#[detail]"] }] },
            }),
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
