import assert from "node:assert/strict";
import { test } from "node:test";
import { ScenarioOwnership } from "@pactia/schema";
import { parseThenClause, parseWhenClause } from "./test-clauses.js";

test("parseWhenClause extracts actor auth ownership method and path", () => {
  const parsed = parseWhenClause(
    "Admin is logged in and POST /api/v1/vehicles with valid body",
  );
  assert.equal(parsed.given.actor, "Admin");
  assert.equal(parsed.given.auth, "logged_in");
  assert.equal(parsed.when.method, "POST");
  assert.equal(parsed.when.path, "/api/v1/vehicles");
  assert.deepEqual(parsed.when.body, { valid: true });
});

test("parseWhenClause maps non-owner ownership", () => {
  const parsed = parseWhenClause("Customer is logged in as non-owner and GET /x");
  assert.equal(parsed.given.ownership, ScenarioOwnership.NonOwner);
});

test("parseWhenClause rejects missing HTTP call", () => {
  assert.throws(() => parseWhenClause("Customer is logged in"), /missing HTTP method/);
});

test("parseThenClause extracts status body ref and kafka emit", () => {
  const parsed = parseThenClause(
    'status is 200 and response matches VehicleListResponse and vehicle.created is emitted',
  );
  assert.equal(parsed.httpStatus, "200");
  assert.equal(parsed.bodyRef, "VehicleListResponse");
  assert.equal(parsed.kafkaEmits, "vehicle.created");
});

test("parseThenClause allows partial then clauses", () => {
  const parsed = parseThenClause("status is 403");
  assert.equal(parsed.httpStatus, "403");
  assert.equal(parsed.bodyRef, undefined);
});
