import assert from "node:assert/strict";
import { test } from "node:test";
import { irWorkspaceSchema } from "@pactia/schema";
import { readTestFixture, TestFixtureId } from "../../../../test/fixture-paths.js";
import { compileIrWorkspace, lowerIrWorkspace } from "./ir.js";
import { extractKernel } from "../frontend/kernel/extract.js";

const fleetSource = readTestFixture(TestFixtureId.FleetManagementV2);

test("lowerIrWorkspace keeps surfaces in product with endpoint-only bind", () => {
  const { workspace } = compileIrWorkspace(fleetSource);
  const surface = workspace.product.product.surfaces[0];

  assert.ok(surface);
  assert.equal(surface.bind?.service, "FleetService");
  assert.equal(surface.bind?.endpoint, "list_vehicles");
  assert.equal(surface.bind?.method, undefined);
  assert.equal(surface.bind?.path, undefined);
});

test("lowerIrWorkspace aggregates module security and deployment to product", () => {
  const { workspace } = compileIrWorkspace(fleetSource);

  assert.ok(workspace.product.product.security?.statements);
  assert.ok(workspace.product.product.security?.policies);
  assert.equal(workspace.product.product.deployment?.id, "fleet");
  assert.equal(workspace.product.product.deployment?.environments.length, 2);
});

test("lowerIrWorkspace keeps API contracts in service slice only", () => {
  const { workspace } = compileIrWorkspace(fleetSource);
  const fleetBundle = workspace.modules[0];
  const fleetService = fleetBundle?.services[0]?.service;

  assert.equal(fleetService?.name, "FleetService");
  assert.equal(fleetService?.flags?.database, true);
  assert.equal(fleetService?.endpoints[0]?.method, "GET");
  assert.equal(fleetService?.endpoints[0]?.path, "/api/v1/vehicles");
});

test("lowerIrWorkspace validates against irWorkspaceSchema", () => {
  const { workspace } = compileIrWorkspace(fleetSource);
  irWorkspaceSchema.parse(workspace);
});

test("emitIrWorkspace uses kebab-case service file stems", () => {
  const { files } = compileIrWorkspace(fleetSource);
  assert.ok(files.has("modules/fleet/services/fleet.service.yaml"));
  assert.ok(files.has("modules/fleet/services/notification.service.yaml"));
});

test("compileIrWorkspace validates REST wire when protocol-rest is imported", () => {
  const { diagnostics } = compileIrWorkspace(fleetSource);
  assert.ok(!diagnostics.some((diagnostic) => diagnostic.target === "import.protocol-rest"));
  assert.ok(!diagnostics.some((diagnostic) => diagnostic.target.startsWith("wire.protocol-rest")));
});

test("compileIrWorkspace expands builtin endpoint macros", () => {
  const { diagnostics, workspace } = compileIrWorkspace(fleetSource);
  assert.ok(!diagnostics.some((diagnostic) => diagnostic.target === "macro.expansion"));

  const fleetService = workspace.modules[0]?.services[0]?.service;
  const listEndpoint = fleetService?.endpoints.find((ep) => ep.id === "list_vehicles");
  assert.deepEqual(listEndpoint?.modifiers, { list: true, paginated: true });

  const createEndpoint = fleetService?.endpoints.find((ep) => ep.id === "create_vehicle");
  assert.deepEqual(createEndpoint?.modifiers, { create: true, idempotency: "REQUIRED" });
});

test("extract and lower are deterministic", () => {
  const first = compileIrWorkspace(fleetSource);
  const second = compileIrWorkspace(fleetSource);
  assert.deepEqual(first.workspace, second.workspace);
  assert.deepEqual(
    [...first.files.entries()].sort(),
    [...second.files.entries()].sort(),
  );
});

test("lowerIrWorkspace requires at least one module", () => {
  const emptyProgram = extractKernel(`pactia 1.0\nproduct X { @stack rust-anb { } }`);
  assert.throws(() => lowerIrWorkspace({ ...emptyProgram, modules: [] }));
});
