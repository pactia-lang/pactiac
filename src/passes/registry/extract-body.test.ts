import assert from "node:assert/strict";
import { test } from "node:test";
import { extractExportBody } from "./extract-body.js";

test("extractExportBody extracts module body", () => {
  const source = "export module commerce {\n  service Api { }\n}";
  const body = extractExportBody(source, "module", "commerce");
  assert.equal(body, "service Api { }");
});

test("extractExportBody extracts service body", () => {
  const source = "export service OrderService {\n  @api list { method: GET, path: \"/orders\" }\n}";
  const body = extractExportBody(source, "service", "OrderService");
  assert.match(body, /@api list/);
});

test("extractExportBody handles nested braces", () => {
  const source = "export model orders {\n  @entity Order { id, name }\n}";
  const body = extractExportBody(source, "model", "orders");
  assert.match(body, /@entity Order/);
});

test("extractExportBody returns empty for missing name", () => {
  const source = "export module commerce { body }";
  const body = extractExportBody(source, "module", "nonexistent");
  assert.equal(body, "");
});

test("extractExportBody returns empty for empty source", () => {
  const body = extractExportBody("", "module", "test");
  assert.equal(body, "");
});
