import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenize, TokenType, PactiaSyntaxError } from "../../frontend/lexer/tokens.js";
import { TokenStream } from "./token-stream.js";

test("TokenStream expect throws on type mismatch", () => {
  const tokens = tokenize("hello");
  const stream = new TokenStream(tokens);
  assert.throws(
    () => stream.expect(TokenType.NUMBER, "Expected a number"),
    PactiaSyntaxError,
  );
});

test("TokenStream expect throws on value mismatch", () => {
  const tokens = tokenize("hello");
  const stream = new TokenStream(tokens);
  assert.throws(
    () => stream.expect(TokenType.IDENT, "Expected 'world'", "world"),
    PactiaSyntaxError,
  );
});
