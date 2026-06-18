import assert from "node:assert/strict";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../test/fixture-paths.js";
import { compile } from "./compile.js";
import { parseThenClause, parseWhenClause } from "./test-clauses.js";
import { extractV2Tests } from "./v2-test-parser.js";

const fleetV2Source = readTestFixture(TestFixtureId.FleetManagementV2);

test("extractV2Tests finds FleetService acceptance scenarios", () => {
  const scenarios = extractV2Tests(fleetV2Source);
  assert.equal(scenarios.length, 3);
  assert.equal(scenarios[0]!.service, "FleetService");
  assert.equal(scenarios[0]!.name, "Admin registers a vehicle");
  assert.match(scenarios[0]!.whenText ?? "", /POST \/api\/v1\/vehicles/);
  assert.match(scenarios[2]!.whenText ?? "", /as owner/);
});

test("parseWhenClause normalizes actor, auth, ownership, and HTTP call", () => {
  const parsed = parseWhenClause(
    "Customer is logged in as owner and GET /api/v1/vehicles",
  );
  assert.equal(parsed.given.actor, "Customer");
  assert.equal(parsed.given.auth, "logged_in");
  assert.equal(parsed.given.ownership, "owner");
  assert.equal(parsed.when.method, "GET");
  assert.equal(parsed.when.path, "/api/v1/vehicles");
});

test("parseThenClause normalizes status, body ref, and kafka emit", () => {
  const parsed = parseThenClause(
    "status is 201 and vehicle.created is emitted",
  );
  assert.equal(parsed.httpStatus, "201");
  assert.equal(parsed.kafkaEmits, "vehicle.created");
});

test("compile fleet fixture emits module-scoped service YAML with scenarios", () => {
  const { files } = compile(fleetV2Source);
  const fleetService = files.get("modules/fleet/services/fleet.service.yaml") ?? "";

  assert.match(fleetService, /name: Admin registers a vehicle/);
  assert.match(fleetService, /service: FleetService/);
  assert.match(fleetService, /method: POST/);
  assert.match(fleetService, /path: \/api\/v1\/vehicles/);
  assert.match(fleetService, /httpStatus: "403"/);
  assert.match(fleetService, /bodyRef: VehicleListResponse/);
  assert.match(fleetService, /kafkaEmits: vehicle\.created/);
  assert.match(fleetService, /provenance: Pactia/);
});

test("compile v2 is deterministic", () => {
  const first = compile(fleetV2Source);
  const second = compile(fleetV2Source);
  for (const path of first.files.keys()) {
    assert.equal(first.files.get(path), second.files.get(path));
  }
});
