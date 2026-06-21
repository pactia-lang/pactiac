import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exportManifestJsonSchema,
  exportModuleSliceJsonSchema,
  exportModelSliceJsonSchema,
  exportProductJsonSchema,
  exportServiceSliceJsonSchema,
  irWorkspaceSchema,
  isAllowlistedIrFilePath,
  manifestSchema,
  modelSliceSchema,
  moduleSliceSchema,
  productSchema,
  serviceSliceSchema,
} from "./index.js";

const fixturesRoot = resolve(import.meta.dirname, "../../../test/fixtures/expected/relay");

function loadJson<T>(relativePath: string): T {
  const content = readFileSync(join(fixturesRoot, relativePath), "utf-8");
  return JSON.parse(content) as T;
}

test("module-scoped IR slice files validate individually", () => {
  manifestSchema.parse(loadJson("input/manifest.json"));
  productSchema.parse(loadJson("input/product.json"));
  moduleSliceSchema.parse(loadJson("input/modules/orders/orders.module.json"));
  modelSliceSchema.parse(loadJson("input/modules/orders/orders.model.json"));
  serviceSliceSchema.parse(loadJson("input/modules/orders/services/order.service.json"));
});

test("module-scoped IR workspace validates as a whole", () => {
  const workspace = {
    manifest: loadJson("input/manifest.json"),
    product: loadJson("input/product.json"),
    modules: [
      {
        module: loadJson("input/modules/orders/orders.module.json"),
        model: loadJson("input/modules/orders/orders.model.json"),
        services: [loadJson("input/modules/orders/services/order.service.json")],
      },
    ],
  };

  const parsed = irWorkspaceSchema.parse(workspace);
  assert.equal(parsed.product.product.stackId, "@pactia/rust-anb");
  assert.equal(parsed.modules.length, 1);
  assert.equal(parsed.modules[0]?.services.length, 1);
  assert.equal(parsed.modules[0]?.services[0]?.service.endpoints.length, 2);
});

test("IR path allowlist accepts root and module-scoped paths", () => {
  assert.equal(isAllowlistedIrFilePath("input/manifest.json"), true);
  assert.equal(isAllowlistedIrFilePath("input/product.json"), true);
  assert.equal(isAllowlistedIrFilePath("input/modules/orders/orders.module.json"), true);
  assert.equal(isAllowlistedIrFilePath("input/modules/orders/orders.model.json"), true);
  assert.equal(isAllowlistedIrFilePath("input/modules/orders/services/order.service.json"), true);
  assert.equal(
    isAllowlistedIrFilePath("input/modules/{moduleKebab}/services/{serviceKebab}.service.json"),
    true,
  );
  assert.equal(isAllowlistedIrFilePath("project.json"), false);
  assert.equal(isAllowlistedIrFilePath("domain.json"), false);
});

test("JSON schema exporters produce named root schemas", () => {
  assert.ok(String(exportManifestJsonSchema()["$ref"]).includes("Manifest"));
  assert.ok(String(exportProductJsonSchema()["$ref"]).includes("Product"));
  assert.ok(String(exportModuleSliceJsonSchema()["$ref"]).includes("ModuleSlice"));
  assert.ok(String(exportModelSliceJsonSchema()["$ref"]).includes("ModelSlice"));
  assert.ok(String(exportServiceSliceJsonSchema()["$ref"]).includes("ServiceSlice"));
});
