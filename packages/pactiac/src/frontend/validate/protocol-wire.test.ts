import assert from "node:assert/strict";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../../test/fixture-paths.js";
import { extractKernel } from "../kernel/extract.js";
import {
  ProtocolWireErrorCode,
  PROTOCOL_REST_COORDINATE,
  resolveProtocolRestWireSchemaPath,
  validateProtocolRestWire,
} from "./protocol-wire.js";

test("resolveProtocolRestWireSchemaPath finds bundled protocol-rest schema", () => {
  assert.ok(resolveProtocolRestWireSchemaPath());
});

test("validateProtocolRestWire passes relay fixture", () => {
  const program = extractKernel(readTestFixture(TestFixtureId.Relay));
  assert.equal(validateProtocolRestWire(program).length, 0);
});

test("validateProtocolRestWire skips when protocol-rest is not imported", () => {
  const program = extractKernel(`pactia 1.0
product X { @stack rust-anb { }
  module m { service S { @api x { method: GET, path: "/x", } } }
}`);
  assert.equal(validateProtocolRestWire(program).length, 0);
});

test("validateProtocolRestWire rejects invalid REST method", () => {
  const program = extractKernel(`pactia 1.0
import ${PROTOCOL_REST_COORDINATE};
product X { @stack rust-anb { }
  module m { service S { @api x { method: BOGUS, path: "/x", } } }
}`);
  const diagnostics = validateProtocolRestWire(program);
  assert.equal(diagnostics.length, 1);
  assert.ok(diagnostics[0]!.message.includes(ProtocolWireErrorCode.WireInvalid));
});
