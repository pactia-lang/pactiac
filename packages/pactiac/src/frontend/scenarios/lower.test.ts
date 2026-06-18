import assert from "node:assert/strict";
import { test } from "node:test";
import { ScenarioProvenance } from "@pactia/schema";
import type { ScenarioDecl } from "./types.js";
import { lowerScenarios } from "./lower.js";

const sampleDecl: ScenarioDecl = {
  name: "Admin registers a vehicle",
  steps: [],
  service: "FleetService",
  whenText: "Admin is logged in and POST /api/v1/vehicles with valid body",
  thenText: "status is 201 and vehicle.created is emitted",
};

test("lowerScenarios maps when/then text into schema scenarios", () => {
  const lowered = lowerScenarios([sampleDecl]);
  assert.equal(lowered.scenarios.length, 1);

  const scenario = lowered.scenarios[0];
  assert.equal(scenario?.name, "Admin registers a vehicle");
  assert.equal(scenario?.service, "FleetService");
  assert.equal(scenario?.provenance, ScenarioProvenance.Pactia);
  assert.equal(scenario?.given.actor, "Admin");
  assert.equal(scenario?.when.method, "POST");
  assert.equal(scenario?.then.httpStatus, "201");
  assert.equal(scenario?.then.kafkaEmits, "vehicle.created");
});

test("lowerScenarios rejects declarations missing service or clauses", () => {
  assert.throws(
    () => lowerScenarios([{ ...sampleDecl, service: undefined }]),
    /missing v2 When\/Then clauses or service scope/,
  );
});
