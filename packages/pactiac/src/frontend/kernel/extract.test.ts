import assert from "node:assert/strict";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../../test/fixture-paths.js";
import { extractKernel } from "./extract.js";

const fleetSource = readTestFixture(TestFixtureId.FleetManagementV2);

test("extractKernel reads product-level facts from fleet fixture", () => {
  const program = extractKernel(fleetSource);

  assert.equal(program.product.name, "FleetManagement");
  assert.equal(program.product.stackPackage, "rust-anb");
  assert.equal(program.product.topologyMode, "MICROSERVICES");
  assert.equal(program.product.tenancyMode, "SINGLE_TENANT");
  assert.ok(program.imports.includes("@pactia/protocol-rest"));
});

test("extractKernel collects hoisted surfaces from nested @api blocks", () => {
  const program = extractKernel(fleetSource);
  assert.equal(program.product.surfaces.length, 4);
  assert.ok(
    program.product.surfaces.every(
      (surface) => surface.serviceName === "FleetService" && surface.apiId.length > 0,
    ),
  );
});

test("extractKernel extracts module deploy security and policies", () => {
  const fleet = programModule(fleetSource);

  assert.equal(fleet.deploy?.environments.length, 2);
  assert.equal(fleet.securityStatements[0]?.text, "All admin mutations must be audit-logged");
  assert.equal(fleet.policies[0]?.retainEntity, "GpsPosition");
  assert.equal(fleet.policies[0]?.residency, "EU");
});

test("extractKernel reads service flags from lines above service block", () => {
  const fleet = programModule(fleetSource);
  const fleetService = fleet.services.find((service) => service.name === "FleetService");
  const notificationService = fleet.services.find(
    (service) => service.name === "NotificationService",
  );

  assert.deepEqual(fleetService?.flags, { database: true, cache: true, events: true });
  assert.deepEqual(notificationService?.flags, { database: true, cache: false, events: true });
});

test("extractKernel maps entities enums and endpoints", () => {
  const fleet = programModule(fleetSource);
  const fleetService = fleet.services.find((service) => service.name === "FleetService");

  assert.ok(fleet.entities.some((entity) => entity.name === "Vehicle"));
  assert.ok(fleet.enums.some((enumDecl) => enumDecl.name === "VehicleStatus"));
  assert.equal(fleetService?.endpoints.length, 4);
  assert.equal(fleetService?.scenarios.length, 3);
});

function programModule(source: string) {
  const program = extractKernel(source);
  const fleet = program.modules.find((module) => module.name === "fleet");
  assert.ok(fleet, "expected fleet module");
  return fleet;
}
