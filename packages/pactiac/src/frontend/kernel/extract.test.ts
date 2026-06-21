import assert from "node:assert/strict";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../../test/fixture-paths.js";
import { extractKernel } from "./extract.js";

const relaySource = readTestFixture(TestFixtureId.Relay);

test("extractKernel reads product-level facts from relay fixture", () => {
  const program = extractKernel(relaySource);

  assert.equal(program.product.name, "Relay");
  assert.equal(program.product.stackPackage, "@pactia/rust-anb");
  assert.equal(program.product.topologyMode, "MICROSERVICES");
  assert.equal(program.product.tenancyMode, "SINGLE_TENANT");
  assert.ok(program.imports.includes("@pactia/protocol-rest"));
  assert.ok(program.imports.includes("@pactia/kernel"));
  assert.ok(program.imports.includes("@pactia/rust-anb"));
});

test("extractKernel collects hoisted surfaces from nested @api blocks", () => {
  const program = extractKernel(relaySource);
  assert.equal(program.product.surfaces.length, 1);
  assert.equal(program.product.surfaces[0]?.serviceName, "OrderService");
  assert.equal(program.product.surfaces[0]?.apiId, "list_orders");
});

test("extractKernel extracts module deploy security", () => {
  const orders = programModule(relaySource);

  assert.equal(orders.deploy?.environments.length, 2);
  assert.equal(orders.securityStatements[0]?.text, "All order mutations must be audit-logged");
});

test("extractKernel reads service flags from lines above service block", () => {
  const orders = programModule(relaySource);
  const orderService = orders.services.find((service) => service.name === "OrderService");

  assert.deepEqual(orderService?.flags, { database: true, cache: false, events: false });
});

test("extractKernel maps entities enums and endpoints", () => {
  const orders = programModule(relaySource);
  const orderService = orders.services.find((service) => service.name === "OrderService");

  assert.ok(orders.entities.some((entity) => entity.name === "Order"));
  assert.ok(orders.enums.some((enumDecl) => enumDecl.name === "OrderStatus"));
  assert.equal(orderService?.endpoints.length, 2);
  assert.equal(orderService?.scenarios.length, 3);
});

function programModule(source: string) {
  const program = extractKernel(source);
  const orders = program.modules.find((module) => module.name === "orders");
  assert.ok(orders, "expected orders module");
  return orders;
}
