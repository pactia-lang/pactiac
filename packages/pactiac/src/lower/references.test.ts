import assert from "node:assert/strict";
import { test } from "node:test";
import type { KernelProgram } from "../frontend/kernel/extract.js";
import { collectManifestReferences } from "./references.js";

const crossModuleProgram: KernelProgram = {
  version: "1.0",
  imports: [],
  product: { name: "X", stackPackage: "rust-anb" },
  modules: [
    {
      name: "billing",
      actors: [],
      rules: [],
      config: {},
      errors: {},
      integrations: [],
      events: [],
      observeSlos: [],
      securityStatements: [],
      policies: [],
      enums: [],
      entities: [
        {
          name: "Invoice",
          fields: [
            {
              name: "customerId",
              type: "UUID",
              array: false,
              optional: false,
              annotations: { references: { entity: "Customer" } },
            },
          ],
        },
      ],
      relations: [],
      stateMachines: [],
      modelRules: [],
      services: [],
    },
    {
      name: "crm",
      actors: [],
      rules: [],
      config: {},
      errors: {},
      integrations: [],
      events: [],
      observeSlos: [],
      securityStatements: [],
      policies: [],
      enums: [],
      entities: [
        {
          name: "Customer",
          fields: [{ name: "id", type: "UUID", array: false, optional: false, annotations: {} }],
        },
      ],
      relations: [],
      stateMachines: [],
      modelRules: [],
      services: [],
    },
  ],
};

test("collectManifestReferences records cross-module @fk edges", () => {
  const refs = collectManifestReferences(crossModuleProgram);
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0], {
    from: { module: "billing", entity: "Invoice", field: "customerId" },
    to: { module: "crm", entity: "Customer" },
  });
});

test("collectManifestReferences skips same-module references", () => {
  const sameModule: KernelProgram = {
    ...crossModuleProgram,
    modules: [crossModuleProgram.modules[1]!],
  };
  assert.equal(collectManifestReferences(sameModule).length, 0);
});
