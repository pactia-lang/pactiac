import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { readTestFixture, repoRoot, TestFixtureId } from "../../../test/fixture-paths.js";
import { compileSource } from "../../application/compile-source.js";
import { parseThenClause, parseWhenClause } from "./clauses.js";
import { extractScenarios } from "./extract-tests.js";

const relayWorkspaceRoot = join(repoRoot, "test/fixtures/workspace/relay");
const relaySource = readTestFixture(TestFixtureId.Relay);

function compileRelay() {
  process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
  return compileSource({
    source: relaySource,
    workspaceRoot: relayWorkspaceRoot,
    entryFile: "product.pactia",
  });
}

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
  const { files } = compileRelay();
  const orderService = files.get("input/modules/orders/services/order.service.json") ?? "";
  const parsed = JSON.parse(orderService) as {
    service: {
      body: Array<{ name?: string; when?: string; then?: string; tag?: string }>;
    };
  };

  const scenarios = parsed.service.body.filter(
    (entry) => entry.tag === "test" && entry.when !== undefined,
  );
  assert.equal(scenarios.length, 3);
  assert.equal(scenarios[0]?.name, "Operator creates an order");
  assert.match(orderService, /OrderService/);
  assert.match(orderService, /POST \/api\/v1\/orders/);
});

test("compile is deterministic", () => {
  const first = compileRelay();
  const second = compileRelay();
  for (const path of first.files.keys()) {
    assert.equal(first.files.get(path), second.files.get(path));
  }
});
