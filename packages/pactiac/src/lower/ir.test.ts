import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { irWorkspaceSchema } from "@pactia/schema";
import { readTestFixture, TestFixtureId } from "../../../../test/fixture-paths.js";
import { assembleWorkspace } from "../frontend/workspace/assemble.js";
import { compileIrWorkspace, lowerIrWorkspace } from "./ir.js";
import { extractKernel } from "../frontend/kernel/extract.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const relaySource = readTestFixture(TestFixtureId.Relay);
const relayWorkspaceRoot = join(repoRoot, "test/fixtures/workspace/relay");

test("lowerIrWorkspace keeps surfaces in product with endpoint-only bind", () => {
  const { workspace } = compileIrWorkspace(relaySource);
  const surface = workspace.product.product.surfaces[0];

  assert.ok(surface);
  assert.equal(surface.bind?.service, "OrderService");
  assert.equal(surface.bind?.endpoint, "list_orders");
  assert.equal(surface.bind?.method, undefined);
  assert.equal(surface.bind?.path, undefined);
});

test("lowerIrWorkspace aggregates module security and deployment to product", () => {
  const { workspace } = compileIrWorkspace(relaySource);

  assert.ok(workspace.product.product.security?.statements);
  assert.equal(workspace.product.product.deployment?.id, "orders");
  assert.equal(workspace.product.product.deployment?.environments.length, 2);
});

test("lowerIrWorkspace keeps API contracts in service slice only", () => {
  const { workspace } = compileIrWorkspace(relaySource);
  const ordersBundle = workspace.modules[0];
  const orderService = ordersBundle?.services[0]?.service;

  assert.equal(orderService?.name, "OrderService");
  assert.equal(orderService?.flags?.database, true);
  assert.equal(orderService?.endpoints[0]?.method, "GET");
  assert.equal(orderService?.endpoints[0]?.path, "/api/v1/orders");
});

test("lowerIrWorkspace validates against irWorkspaceSchema", () => {
  const { workspace } = compileIrWorkspace(relaySource);
  irWorkspaceSchema.parse(workspace);
});

test("emitIrWorkspace uses kebab-case service file stems", () => {
  const { files } = compileIrWorkspace(relaySource);
  assert.ok(files.has("input/modules/orders/services/order.service.json"));
});

test("compileIrWorkspace validates REST wire when protocol-rest is imported", () => {
  const { diagnostics } = compileIrWorkspace(relaySource);
  assert.ok(!diagnostics.some((diagnostic) => diagnostic.target === "import.protocol-rest"));
  assert.ok(!diagnostics.some((diagnostic) => diagnostic.target.startsWith("wire.protocol-rest")));
});

test("compileIrWorkspace expands builtin endpoint macros", () => {
  const previous = process.env["PACTIA_VENDOR_ROOT"];
  process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
  try {
    const assembled = assembleWorkspace(relayWorkspaceRoot);
    const { diagnostics, workspace } = compileIrWorkspace(relaySource, {
      effectiveRegistry: assembled.effectiveRegistry,
      packagesResolved: assembled.lockfileDigest !== undefined,
      lockfileDigest: assembled.lockfileDigest,
      loadedPackages: assembled.loadedPackages,
    });
    assert.ok(!diagnostics.some((diagnostic) => diagnostic.target === "macro.expansion"));

    const orderService = workspace.modules[0]?.services[0]?.service;
    const listEndpoint = orderService?.endpoints.find((ep) => ep.id === "list_orders");
    assert.deepEqual(listEndpoint?.modifiers, { paginated: true, pageSize: 50 });

    const createEndpoint = orderService?.endpoints.find((ep) => ep.id === "create_order");
    assert.deepEqual(createEndpoint?.modifiers, { create: true, idempotency: "REQUIRED" });
  } finally {
    if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
    else process.env["PACTIA_VENDOR_ROOT"] = previous;
  }
});

test("extract and lower are deterministic", () => {
  const first = compileIrWorkspace(relaySource);
  const second = compileIrWorkspace(relaySource);
  assert.deepEqual(first.workspace, second.workspace);
  assert.deepEqual(
    [...first.files.entries()].sort(),
    [...second.files.entries()].sort(),
  );
});

test("lowerIrWorkspace requires at least one module", () => {
  const emptyProgram = extractKernel(`pactia 1.0\nproduct X { @stack platform { package: "@pactia/rust-anb" } }`);
  assert.throws(() => lowerIrWorkspace({ ...emptyProgram, modules: [] }));
});
