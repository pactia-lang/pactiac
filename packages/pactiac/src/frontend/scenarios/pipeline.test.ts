import assert from "node:assert/strict";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../../test/fixture-paths.js";
import { compile } from "../../compile/compile.js";
import { parseThenClause, parseWhenClause } from "./clauses.js";
import { extractScenarios } from "./extract-tests.js";

const relaySource = readTestFixture(TestFixtureId.Relay);

test("extractScenarios finds OrderService acceptance scenarios", () => {
  const scenarios = extractScenarios(relaySource);
  assert.equal(scenarios.length, 3);
  assert.equal(scenarios[0]!.service, "OrderService");
  assert.equal(scenarios[0]!.name, "Operator creates an order");
  assert.match(scenarios[0]!.whenText ?? "", /POST \/api\/v1\/orders/);
  assert.match(scenarios[1]!.whenText ?? "", /GET \/api\/v1\/orders/);
});

test("parseWhenClause normalizes actor, auth, ownership, and HTTP call", () => {
  const parsed = parseWhenClause(
    "Operator is logged in and GET /api/v1/orders",
  );
  assert.equal(parsed.given.actor, "Operator");
  assert.equal(parsed.given.auth, "logged_in");
  assert.equal(parsed.when.method, "GET");
  assert.equal(parsed.when.path, "/api/v1/orders");
});

test("parseThenClause normalizes status, body ref, and kafka emit", () => {
  const parsed = parseThenClause(
    "status is 201 and order.created is emitted",
  );
  assert.equal(parsed.httpStatus, "201");
  assert.equal(parsed.kafkaEmits, "order.created");
});

test("compile relay fixture emits module-scoped service JSON with scenarios", () => {
  const { files } = compile(relaySource);
  const orderService = files.get("input/modules/orders/services/order.service.json") ?? "";
  const parsed = JSON.parse(orderService) as {
    service: { scenarios: Array<{ name: string; when?: { method?: string } }> };
  };

  assert.equal(parsed.service.scenarios[0]?.name, "Operator creates an order");
  assert.match(orderService, /OrderService/);
  assert.match(orderService, /"method": "POST"/);
  assert.match(orderService, /"path": "\/api\/v1\/orders"/);
  assert.match(orderService, /"httpStatus": "403"/);
  assert.match(orderService, /"bodyRef": "OrderListResponse"/);
  assert.match(orderService, /"kafkaEmits": "order\.created"/);
  assert.match(orderService, /"provenance": "Pactia"/);
});

test("compile is deterministic", () => {
  const first = compile(relaySource);
  const second = compile(relaySource);
  for (const path of first.files.keys()) {
    assert.equal(first.files.get(path), second.files.get(path));
  }
});
