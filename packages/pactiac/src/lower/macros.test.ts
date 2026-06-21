import assert from "node:assert/strict";
import { test } from "node:test";
import { BuiltinMacro, expandEndpointMacros, isBuiltinMacro, parseMacroName } from "./macros.js";
import {
  RegistryError,
  RegistryErrorCode,
  RegistryMacroTier,
  buildEffectiveRegistry,
} from "../resolve/registry.js";
import type { LoadedPackage } from "../resolve/loader.js";

test("parseMacroName strips macro arguments", () => {
  assert.equal(parseMacroName("rate_limit(100, minute)"), "rate_limit");
  assert.equal(parseMacroName("list"), "list");
});

test("expandEndpointMacros maps list paginated detail create", () => {
  const { modifiers, unknownMacros } = expandEndpointMacros([
    BuiltinMacro.List,
    BuiltinMacro.Paginated,
    BuiltinMacro.Detail,
    BuiltinMacro.Create,
  ]);
  assert.deepEqual(modifiers, {
    list: true,
    paginated: true,
    detail: true,
    create: true,
  });
  assert.equal(unknownMacros.length, 0);
});

test("expandEndpointMacros maps idempotent to REQUIRED", () => {
  const { modifiers } = expandEndpointMacros([BuiltinMacro.Idempotent]);
  assert.equal(modifiers.idempotency, "REQUIRED");
});

test("expandEndpointMacros reports unknown macros", () => {
  const { unknownMacros } = expandEndpointMacros(["custom_macro"]);
  assert.deepEqual(unknownMacros, ["custom_macro"]);
});

test("isBuiltinMacro recognizes built-ins", () => {
  assert.equal(isBuiltinMacro("owner"), true);
  assert.equal(isBuiltinMacro("custom"), false);
});

test("expandEndpointMacros applies stack registry overrides", () => {
  const loaded: LoadedPackage[] = [
    {
      coordinate: "@pactia/rust-anb",
      version: "1.0.0",
      digest: "sha256:abc",
      rootDir: "/tmp",
      manifestSource: JSON.stringify({
        registry: {
          macros: [
            {
              name: "paginated",
              expandsTo: ["modifiers.pageSize: 50", "modifiers.paginated: true"],
            },
          ],
        },
      }),
    },
  ];
  const registry = buildEffectiveRegistry({
    stackCoordinate: "@pactia/rust-anb",
    importCoordinates: [],
    loaded,
  });

  const { modifiers, unknownMacros } = expandEndpointMacros(["paginated"], registry);
  assert.deepEqual(modifiers, { pageSize: 50, paginated: true });
  assert.equal(unknownMacros.length, 0);
});

test("expandEndpointMacros follows registry expands_to macro chain", () => {
  const loaded: LoadedPackage[] = [
    {
      coordinate: "@pactia/rust-anb",
      version: "1.0.0",
      digest: "sha256:abc",
      rootDir: "/tmp",
      manifestSource: JSON.stringify({
        registry: {
          macros: [{ name: "list", expandsTo: ["#[paginated]"] }],
        },
      }),
    },
  ];
  const registry = buildEffectiveRegistry({
    stackCoordinate: "@pactia/rust-anb",
    importCoordinates: [],
    loaded,
  });

  const { modifiers } = expandEndpointMacros(["list"], registry);
  assert.deepEqual(modifiers, { paginated: true });
});

test("expandEndpointMacros detects registry expansion cycles", () => {
  const loaded: LoadedPackage[] = [
    {
      coordinate: "@pactia/rust-anb",
      version: "1.0.0",
      digest: "sha256:abc",
      rootDir: "/tmp",
      manifestSource: JSON.stringify({
        registry: {
          macros: [
            { name: "list", expandsTo: ["#[paginated]"] },
            { name: "paginated", expandsTo: ["#[list]"] },
          ],
        },
      }),
    },
  ];
  const registry = buildEffectiveRegistry({
    stackCoordinate: "@pactia/rust-anb",
    importCoordinates: [],
    loaded,
  });

  assert.throws(
    () => expandEndpointMacros(["list"], registry),
    (error: unknown) => {
      assert.ok(error instanceof RegistryError);
      assert.equal(error.code, RegistryErrorCode.MacroExpansionCycle);
      return true;
    },
  );
});
