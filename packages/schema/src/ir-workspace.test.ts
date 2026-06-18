import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
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

const fixturesRoot = resolve(import.meta.dirname, "../test/fixtures");

function loadYaml<T>(relativePath: string): T {
  const content = readFileSync(join(fixturesRoot, relativePath), "utf-8");
  return parseYaml(content) as T;
}

test("module-scoped IR slice files validate individually", () => {
  manifestSchema.parse(loadYaml("manifest.yaml"));
  productSchema.parse(loadYaml("product.yaml"));
  moduleSliceSchema.parse(loadYaml("modules/fleet/fleet.module.yaml"));
  modelSliceSchema.parse(loadYaml("modules/fleet/fleet.model.yaml"));
  serviceSliceSchema.parse(loadYaml("modules/fleet/services/fleet.service.yaml"));
});

test("module-scoped IR workspace validates as a whole", () => {
  const workspace = {
    manifest: loadYaml("manifest.yaml"),
    product: loadYaml("product.yaml"),
    modules: [
      {
        module: loadYaml("modules/fleet/fleet.module.yaml"),
        model: loadYaml("modules/fleet/fleet.model.yaml"),
        services: [loadYaml("modules/fleet/services/fleet.service.yaml")],
      },
    ],
  };

  const parsed = irWorkspaceSchema.parse(workspace);
  assert.equal(parsed.product.product.stackId, "@pactia/rust-anb");
  assert.equal(parsed.modules.length, 1);
  assert.equal(parsed.modules[0]?.services.length, 1);
  assert.equal(parsed.modules[0]?.services[0]?.service.endpoints.length, 1);
});

test("IR path allowlist accepts root and module-scoped paths", () => {
  assert.equal(isAllowlistedIrFilePath("manifest.yaml"), true);
  assert.equal(isAllowlistedIrFilePath("product.yaml"), true);
  assert.equal(isAllowlistedIrFilePath("modules/fleet/fleet.module.yaml"), true);
  assert.equal(isAllowlistedIrFilePath("modules/fleet/fleet.model.yaml"), true);
  assert.equal(isAllowlistedIrFilePath("modules/fleet/services/fleet.service.yaml"), true);
  assert.equal(
    isAllowlistedIrFilePath("modules/{moduleKebab}/services/{serviceKebab}.service.yaml"),
    true,
  );
  assert.equal(isAllowlistedIrFilePath("project.yaml"), false);
  assert.equal(isAllowlistedIrFilePath("domain.yaml"), false);
});

test("JSON schema exporters produce named root schemas", () => {
  assert.ok(String(exportManifestJsonSchema()["$ref"]).includes("Manifest"));
  assert.ok(String(exportProductJsonSchema()["$ref"]).includes("Product"));
  assert.ok(String(exportModuleSliceJsonSchema()["$ref"]).includes("ModuleSlice"));
  assert.ok(String(exportModelSliceJsonSchema()["$ref"]).includes("ModelSlice"));
  assert.ok(String(exportServiceSliceJsonSchema()["$ref"]).includes("ServiceSlice"));
});
