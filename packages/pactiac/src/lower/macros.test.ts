import assert from "node:assert/strict";
import { test } from "node:test";
import { BuiltinMacro, expandEndpointMacros, isBuiltinMacro, parseMacroName } from "./macros.js";

test("parseMacroName strips macro arguments", () => {
  assert.equal(parseMacroName("rate_limit(100, minute)"), "rate_limit");
  assert.equal(parseMacroName("list"), "list");
});

test("expandEndpointMacros maps list paginated detail create", () => {
  const { modifiers, unknownMacros } = expandEndpointMacros([
    BuiltinMacro.List,
    BuiltinMacro.Paginated,
    BuiltinMacro.Detail,
    BuiltinMacro.Create,
  ]);
  assert.deepEqual(modifiers, {
    list: true,
    paginated: true,
    detail: true,
    create: true,
  });
  assert.equal(unknownMacros.length, 0);
});

test("expandEndpointMacros maps idempotent to REQUIRED", () => {
  const { modifiers } = expandEndpointMacros([BuiltinMacro.Idempotent]);
  assert.equal(modifiers.idempotency, "REQUIRED");
});

test("expandEndpointMacros reports unknown macros", () => {
  const { unknownMacros } = expandEndpointMacros(["custom_macro"]);
  assert.deepEqual(unknownMacros, ["custom_macro"]);
});

test("isBuiltinMacro recognizes built-ins", () => {
  assert.equal(isBuiltinMacro("owner"), true);
  assert.equal(isBuiltinMacro("custom"), false);
});
