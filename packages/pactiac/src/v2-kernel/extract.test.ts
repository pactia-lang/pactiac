import assert from "node:assert/strict";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../test/fixture-paths.js";
import { extractV2Kernel } from "./extract.js";

const fleetSource = readTestFixture(TestFixtureId.FleetManagementV2);

test("extractV2Kernel reads product-level facts from fleet fixture", () => {
  const program = extractV2Kernel(fleetSource);

  assert.equal(program.product.name, "FleetManagement");
  assert.equal(program.product.stackPackage, "rust-anb");
  assert.equal(program.product.topologyMode, "MICROSERVICES");
  assert.equal(program.product.tenancyMode, "SINGLE_TENANT");
  assert.ok(program.imports.includes("@pactia/protocol-rest"));
});

test("extractV2Kernel collects hoisted surfaces from nested @api blocks", () => {
  const program = extractV2Kernel(fleetSource);
  assert.equal(program.product.surfaces.length, 4);
  assert.ok(
    program.product.surfaces.every(
      (surface) => surface.serviceName === "FleetService" && surface.apiId.length > 0,
    ),
  );
});

test("extractV2Kernel extracts module deploy security and policies", () => {
  const fleet = programModule(fleetSource);

  assert.equal(fleet.deploy?.environments.length, 2);
  assert.equal(fleet.securityStatements[0]?.text, "All admin mutations must be audit-logged");
  assert.equal(fleet.policies[0]?.retainEntity, "GpsPosition");
  assert.equal(fleet.policies[0]?.residency, "EU");
});

test("extractV2Kernel reads service flags from lines above service block", () => {
  const fleet = programModule(fleetSource);
  const fleetService = fleet.services.find((service) => service.name === "FleetService");
  const notificationService = fleet.services.find(
    (service) => service.name === "NotificationService",
  );

  assert.deepEqual(fleetService?.flags, { database: true, cache: true, events: true });
  assert.deepEqual(notificationService?.flags, { database: true, cache: false, events: true });
});

test("extractV2Kernel maps entities enums and endpoints", () => {
  const fleet = programModule(fleetSource);
  const fleetService = fleet.services.find((service) => service.name === "FleetService");

  assert.ok(fleet.entities.some((entity) => entity.name === "Vehicle"));
  assert.ok(fleet.enums.some((enumDecl) => enumDecl.name === "VehicleStatus"));
  assert.equal(fleetService?.endpoints.length, 4);
  assert.equal(fleetService?.scenarios.length, 3);
});

function programModule(source: string) {
  const program = extractV2Kernel(source);
  const fleet = program.modules.find((module) => module.name === "fleet");
  assert.ok(fleet, "expected fleet module");
  return fleet;
}
