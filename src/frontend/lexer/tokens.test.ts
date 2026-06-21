import assert from "node:assert/strict";
import { test } from "node:test";
import { TokenType, tokenize } from "./tokens.js";

test("tokenize recognizes kernel punctuation and identifiers", () => {
  const tokens = tokenize(`product Fleet { @api list { method: GET, } }`);
  const types = tokens.map((token) => token.type);
  assert.ok(types.includes(TokenType.IDENT));
  assert.ok(types.includes(TokenType.LBRACE));
  assert.ok(types.includes(TokenType.RBRACE));
  assert.ok(types.includes(TokenType.COLON));
  assert.ok(types.includes(TokenType.COMMA));
  assert.equal(tokens.at(-1)?.type, TokenType.EOF);
});

test("tokenize recognizes strings paths and prose prefix", () => {
  const tokens = tokenize(`path: "/api/v1/vehicles", > prose line`);
  assert.ok(tokens.some((token) => token.type === TokenType.STRING));
  assert.ok(tokens.some((token) => token.type === TokenType.GT));
});

test("tokenize recognizes constant interpolation in prose", () => {
  const tokens = tokenize("> policy ${max_page} and ${pagination_hint}");
  assert.ok(tokens.some((token) => token.value === "${max_page}"));
  assert.ok(tokens.some((token) => token.value === "${pagination_hint}"));
});

test("tokenize preserves line and column metadata", () => {
  const tokens = tokenize("product\n  Fleet {");
  const product = tokens[0];
  assert.equal(product?.value, "product");
  assert.equal(product?.line, 1);
  const fleet = tokens.find((token) => token.value === "Fleet");
  assert.equal(fleet?.line, 2);
});
