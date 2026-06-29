import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RegistryEntryKind,
  RegistryPrecedenceTier,
} from "../../domain/registry.js";
import type {
  RegistryTagEntry,
  RegistryMacroEntry,
  PackageContextExport,
} from "../../domain/registry.js";
import { IrFile, IrMerge, PlacementTarget } from "../../domain/index.js";
import { mergeEffectiveRegistry } from "./build-effective-registry.js";

const tagA: RegistryTagEntry = {
  kind: RegistryEntryKind.Tag,
  name: "api",
  source: "@pactia/kernel",
  in: [PlacementTarget.Service],
  fields: { required: [], optional: [], modifier: false, openExtension: true },
  modifier: false,
  ir: { file: IrFile.Service, path: "body[]", merge: IrMerge.AppendHost },
};

const tagB: RegistryTagEntry = {
  ...tagA,
  source: "@acme/rules",
};

const macroA: RegistryMacroEntry = {
  kind: RegistryEntryKind.Macro,
  name: "list",
  source: "@pactia/rust-stack",
  in: [PlacementTarget.Service],
  params: [],
  body: { lines: [], items: [] },
};

const macroB: RegistryMacroEntry = {
  ...macroA,
  source: "@acme/stack",
};

const ctxA: PackageContextExport = {
  name: "api_notes",
  coordinate: "@pactia/kernel",
  guidance: [],
};

const ctxB: PackageContextExport = {
  ...ctxA,
  coordinate: "@acme/docs",
};

test("mergeEffectiveRegistry rejects colliding tags", () => {
  assert.throws(
    () =>
      mergeEffectiveRegistry({
        importEntries: [
          {
            coordinate: "@pactia/kernel",
            tier: RegistryPrecedenceTier.Dependency,
            tags: [tagA],
            macros: [],
            contexts: [],
            constants: new Map(),
            topologyExports: [],
          },
          {
            coordinate: "@acme/rules",
            tier: RegistryPrecedenceTier.Dependency,
            tags: [tagB],
            macros: [],
            contexts: [],
            constants: new Map(),
            topologyExports: [],
          },
        ],
        localTags: [],
        localMacros: [],
      }),
    /REGISTRY_COLLISION.*api.*@pactia\/kernel.*@acme\/rules/,
  );
});

test("mergeEffectiveRegistry rejects colliding macros", () => {
  assert.throws(
    () =>
      mergeEffectiveRegistry({
        importEntries: [
          {
            coordinate: "@pactia/rust-stack",
            tier: RegistryPrecedenceTier.Dependency,
            tags: [],
            macros: [macroA],
            contexts: [],
            constants: new Map(),
            topologyExports: [],
          },
          {
            coordinate: "@acme/stack",
            tier: RegistryPrecedenceTier.Dependency,
            tags: [],
            macros: [macroB],
            contexts: [],
            constants: new Map(),
            topologyExports: [],
          },
        ],
        localTags: [],
        localMacros: [],
      }),
    /REGISTRY_COLLISION.*list.*@pactia\/rust-stack.*@acme\/stack/,
  );
});

test("mergeEffectiveRegistry rejects colliding contexts", () => {
  assert.throws(
    () =>
      mergeEffectiveRegistry({
        importEntries: [
          {
            coordinate: "@pactia/kernel",
            tier: RegistryPrecedenceTier.Dependency,
            tags: [],
            macros: [],
            contexts: [ctxA],
            constants: new Map(),
            topologyExports: [],
          },
          {
            coordinate: "@acme/docs",
            tier: RegistryPrecedenceTier.Dependency,
            tags: [],
            macros: [],
            contexts: [ctxB],
            constants: new Map(),
            topologyExports: [],
          },
        ],
        localTags: [],
        localMacros: [],
      }),
    /REGISTRY_COLLISION.*context.*api_notes.*@pactia\/kernel.*@acme\/docs/,
  );
});

test("mergeEffectiveRegistry allows same-source entries", () => {
  assert.doesNotThrow(() =>
    mergeEffectiveRegistry({
      importEntries: [
        {
          coordinate: "@pactia/kernel",
          tier: RegistryPrecedenceTier.Dependency,
          tags: [tagA],
          macros: [macroA],
          contexts: [ctxA],
          constants: new Map(),
            topologyExports: [],
        },
      ],
      localTags: [tagA],
      localMacros: [],
    }),
  );
});

test("mergeEffectiveRegistry rejects colliding topology exports as TOPOLOGY_DUPLICATE_SERVICE", () => {
  assert.throws(
    () =>
      mergeEffectiveRegistry({
        importEntries: [
          {
            coordinate: "@acme/backend",
            tier: RegistryPrecedenceTier.Dependency,
            tags: [],
            macros: [],
            contexts: [],
            constants: new Map(),
            topologyExports: [
              { kind: "service", name: "OrderService", source: "@acme/backend", body: "..." },
            ],
          },
          {
            coordinate: "@acme/web",
            tier: RegistryPrecedenceTier.Dependency,
            tags: [],
            macros: [],
            contexts: [],
            constants: new Map(),
            topologyExports: [
              { kind: "service", name: "OrderService", source: "@acme/web", body: "..." },
            ],
          },
        ],
        localTags: [],
        localMacros: [],
      }),
    /TOPOLOGY_DUPLICATE_SERVICE.*OrderService.*@acme\/backend.*@acme\/web/,
  );
});

test("mergeEffectiveRegistry rejects local def colliding with imported def", () => {
  const localTag: RegistryTagEntry = {
    ...tagA,
    source: "local",
  };
  assert.throws(
    () =>
      mergeEffectiveRegistry({
        importEntries: [
          {
            coordinate: "@pactia/kernel",
            tier: RegistryPrecedenceTier.Dependency,
            tags: [tagA],
            macros: [],
            contexts: [],
            constants: new Map(),
            topologyExports: [],
          },
        ],
        localTags: [localTag],
        localMacros: [],
      }),
    /REGISTRY_COLLISION.*api/,
  );
});

test("mergeEffectiveRegistry allows same-source local defs with different placements", () => {
  const local1: RegistryTagEntry = {
    ...tagA,
    source: "local",
  };
  const local2: RegistryTagEntry = {
    ...tagA,
    source: "local",
    in: [PlacementTarget.Module],
  };
  // Same source = no collision. Last one wins silently.
  const registry = mergeEffectiveRegistry({
    importEntries: [],
    localTags: [local1, local2],
    localMacros: [],
  });
  assert.ok(registry.tags.has("api"));
});

test("mergeEffectiveRegistry does not throw when same package exports same tag from manifest file", () => {
  // Simulates multi-file package: index.pactia + manifest file both export @api
  // Same source = same package coordinate = no collision
  assert.doesNotThrow(() =>
    mergeEffectiveRegistry({
      importEntries: [
        {
          coordinate: "@demo/multifile",
          tier: RegistryPrecedenceTier.Dependency,
          tags: [
            { ...tagA, source: "@demo/multifile" },
            { ...tagA, source: "@demo/multifile" }, // same tag, same source
          ],
          macros: [
            { ...macroA, source: "@demo/multifile" },
            { ...macroA, source: "@demo/multifile" }, // same macro, same source
          ],
          contexts: [],
          constants: new Map(),
          topologyExports: [],
        },
      ],
      localTags: [],
      localMacros: [],
    }),
  );
});
