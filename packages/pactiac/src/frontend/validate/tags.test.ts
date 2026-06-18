import assert from "node:assert/strict";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../../test/fixture-paths.js";
import { extractKernel } from "../kernel/extract.js";
import { loadKernelTagCatalog } from "./catalog.js";
import { resolveSpecRoot } from "./spec-root.js";
import { TagValidationErrorCode } from "./schema-validate.js";
import { validateKernelTags, validateKernelTagsStructural } from "./tags.js";

test("resolveSpecRoot finds PACTIA_SPEC_ROOT, sibling spec, or bundled fixtures", () => {
  assert.ok(resolveSpecRoot());
});

test("loadKernelTagCatalog marks fleet tag schemas as normative", () => {
  const catalog = loadKernelTagCatalog();
  assert.ok(catalog);
  assert.equal(catalog.entries.get("api")?.normative, true);
  assert.equal(catalog.entries.get("auth")?.normative, true);
  assert.equal(catalog.entries.get("entity")?.normative, true);
});

test("validateKernelTags passes minimal valid product", () => {
  const catalog = loadKernelTagCatalog();
  const program = extractKernel(`pactia 1.0
import @pactia/protocol-rest;
product Fleet { @stack rust-anb { }
  module fleet { service FleetService {
    @auth { roles: [Admin] }
    @api list_x { method: GET, path: "/x", }
  } }
}`);
  assert.equal(validateKernelTags(program, catalog).length, 0);
});

test("validateKernelTags reports TAG_BODY_INVALID for incomplete @api", () => {
  const catalog = loadKernelTagCatalog();
  const program = extractKernel(`pactia 1.0
product X { @stack rust-anb { }
  module m { service S {
    @api broken { }
  } }
}`);
  const diagnostics = validateKernelTags(program, catalog);
  assert.ok(diagnostics.length > 0);
  assert.ok(diagnostics.every((d) => d.message.includes(TagValidationErrorCode.TagBodyInvalid)));
  assert.ok(diagnostics.some((d) => d.target.includes("api.broken")));
});

test("validateKernelTags passes fleet-management-v2 fixture", () => {
  const catalog = loadKernelTagCatalog();
  assert.ok(catalog);

  const program = extractKernel(readTestFixture(TestFixtureId.FleetManagementV2));
  assert.equal(validateKernelTags(program, catalog).length, 0);
});

test("validateKernelTagsStructural remains fallback without catalog", () => {
  const program = extractKernel(`pactia 1.0
product X { @stack rust-anb { }
  module m { service S {
    @api broken { }
  } }
}`);
  const diagnostics = validateKernelTagsStructural(program);
  assert.ok(diagnostics.some((d) => d.target.endsWith(".method")));
  assert.ok(diagnostics.some((d) => d.target.endsWith(".path")));
});
