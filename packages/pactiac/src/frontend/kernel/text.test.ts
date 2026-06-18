import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractProseLines,
  normalizeTenancyMode,
  normalizeTopologyMode,
  proseToGuidance,
  proseToText,
  scalarTypeToIr,
  serviceFileStem,
  stripFieldValue,
} from "./text.js";

test("stripFieldValue removes quotes and trailing comma", () => {
  assert.equal(stripFieldValue('"hello",'), "hello");
  assert.equal(stripFieldValue("plain,"), "plain");
});

test("prose helpers normalize multiline guidance", () => {
  const lines = extractProseLines("> one\n> two");
  assert.equal(proseToText(lines), "one\ntwo");
  assert.deepEqual(proseToGuidance(lines), ["one", "two"]);
  assert.equal(proseToGuidance(["only"]), "only");
});

test("serviceFileStem removes Service suffix and kebab-cases", () => {
  assert.equal(serviceFileStem("FleetService"), "fleet");
  assert.equal(serviceFileStem("NotificationService"), "notification");
});

test("scalarTypeToIr maps kernel scalars", () => {
  assert.equal(scalarTypeToIr("uuid"), "UUID");
  assert.equal(scalarTypeToIr("datetime"), "DATETIME");
});

test("topology and tenancy normalizers", () => {
  assert.equal(normalizeTopologyMode("microservices"), "MICROSERVICES");
  assert.equal(normalizeTenancyMode("single"), "SINGLE_TENANT");
});
