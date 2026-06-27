import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseScalarValue,
  parseIrAssignmentLine,
  substituteMacroArgs,
  getAtPath,
  setAtPath,
  mergeDeep,
  pathPresent,
} from "./ir-path.js";

test("parseScalarValue handles primitives", () => {
  assert.equal(parseScalarValue("true"), true);
  assert.equal(parseScalarValue("false"), false);
  assert.equal(parseScalarValue("42"), 42);
  assert.equal(parseScalarValue("3.14"), 3.14);
  assert.equal(parseScalarValue('"hello"'), "hello");
  assert.equal(parseScalarValue("hello,"), "hello");
  assert.deepEqual(parseScalarValue("[]"), []);
  assert.deepEqual(parseScalarValue("[a, b]"), ["a", "b"]);
});

test("parseIrAssignmentLine parses key: value", () => {
  const result = parseIrAssignmentLine("method: GET");
  assert.ok(result);
  assert.equal(result.path, "method");
  assert.equal(result.value, "GET");
});

test("parseIrAssignmentLine returns undefined for invalid lines", () => {
  assert.equal(parseIrAssignmentLine("no colon here"), undefined);
});

test("substituteMacroArgs replaces placeholders", () => {
  assert.equal(
    substituteMacroArgs("hello {{0}} world", ["cruel"]),
    "hello cruel world",
  );
  assert.equal(
    substituteMacroArgs("a {{0}} b {{1}} c", ["x", "y"]),
    "a x b y c",
  );
  assert.equal(
    substituteMacroArgs("missing {{5}}", ["a"]),
    "missing ",
  );
});

test("getAtPath navigates nested objects", () => {
  const obj = { a: { b: { c: 42 } } };
  assert.equal(getAtPath(obj, "a.b.c"), 42);
  assert.equal(getAtPath(obj, "a.b.missing"), undefined);
  assert.equal(getAtPath(obj, "x.y"), undefined);
});

test("setAtPath creates nested objects", () => {
  const obj: Record<string, unknown> = {};
  setAtPath(obj, "a.b.c", 42);
  assert.deepEqual(obj, { a: { b: { c: 42 } } });
});

test("setAtPath overwrites existing values", () => {
  const obj: Record<string, unknown> = { a: { b: { c: 1 } } };
  setAtPath(obj, "a.b.c", 99);
  assert.deepEqual(obj, { a: { b: { c: 99 } } });
});

test("mergeDeep merges nested objects", () => {
  const target: Record<string, unknown> = { a: { x: 1 }, b: 2 };
  const patch: Record<string, unknown> = { a: { y: 2 }, c: 3 };
  mergeDeep(target, patch);
  assert.deepEqual(target, { a: { x: 1, y: 2 }, b: 2, c: 3 });
});

test("mergeDeep handles non-object values", () => {
  const target: Record<string, unknown> = { a: 1 };
  const patch: Record<string, unknown> = { a: 2, b: [1, 2] };
  mergeDeep(target, patch);
  assert.deepEqual(target, { a: 2, b: [1, 2] });
});

test("pathPresent returns true for non-empty values", () => {
  const obj = { a: { b: "hello" } };
  assert.equal(pathPresent(obj, "a.b"), true);
});

test("pathPresent returns false for empty/missing values", () => {
  const obj = { a: { b: "" } };
  assert.equal(pathPresent(obj, "a.b"), false);
  assert.equal(pathPresent(obj, "a.missing"), false);
  assert.equal(pathPresent(obj, "x.y"), false);
});
