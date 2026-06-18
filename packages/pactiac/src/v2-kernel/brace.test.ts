import assert from "node:assert/strict";
import { test } from "node:test";
import { PactiaSyntaxError } from "../tokens.js";
import { collectTagBlocks, extractBlockAfter, findMatchingBrace } from "./brace.js";

test("findMatchingBrace returns index of closing brace at same depth", () => {
  const source = "outer { inner { } tail }";
  const open = source.indexOf("{");
  const close = findMatchingBrace(source, open);
  assert.equal(source.slice(open, close + 1), "{ inner { } tail }");
});

test("findMatchingBrace throws on unclosed block", () => {
  assert.throws(() => findMatchingBrace("{ unclosed", 0), PactiaSyntaxError);
});

test("collectTagBlocks extracts tagged blocks with optional ids", () => {
  const source = `@actor admin { role: Admin, } @rule r1 { > text }`;
  const actors = collectTagBlocks(source, "actor");
  const rules = collectTagBlocks(source, "rule");

  assert.equal(actors.length, 1);
  assert.equal(actors[0]?.id, "admin");
  assert.match(actors[0]?.body ?? "", /role: Admin/);

  assert.equal(rules.length, 1);
  assert.equal(rules[0]?.id, "r1");
});

test("extractBlockAfter returns first matching named block", () => {
  const source = `module fleet { model FleetModel { name: Fleet, } }`;
  const model = extractBlockAfter(source, /\bmodel\s+([A-Za-z][\w]*)\s*\{/);
  assert.equal(model?.id, "FleetModel");
  assert.match(model?.body ?? "", /name: Fleet/);
});
