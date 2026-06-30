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

test("tokenize captures prose text including interpolation as single PROSE_TEXT token", () => {
  const tokens = tokenize("> policy ${max_page} and ${pagination_hint}");
  const proseText = tokens.find((token) => token.type === TokenType.PROSE_TEXT);
  assert.ok(proseText, "expected PROSE_TEXT token");
  assert.ok(proseText.value.includes("${max_page}"));
  assert.ok(proseText.value.includes("${pagination_hint}"));
});

test("tokenize preserves line and column metadata", () => {
  const tokens = tokenize("product\n  Fleet {");
  const product = tokens[0];
  assert.equal(product?.value, "product");
  assert.equal(product?.line, 1);
  const fleet = tokens.find((token) => token.value === "Fleet");
  assert.equal(fleet?.line, 2);
});

// ── Prose tests ──

test("tokenize captures single-line prose as PROSE_TEXT after GT", () => {
  const tokens = tokenize("> Hello world");
  assert.ok(tokens.some((t) => t.type === TokenType.GT));
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.equal(prose.value, " Hello world");
});

test("tokenize allows @ symbols in prose text", () => {
  const tokens = tokenize("> Use @api and @actor tags for structure");
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.ok(prose.value.includes("@api"));
  assert.ok(prose.value.includes("@actor"));
});

test("tokenize allows # macros in prose text", () => {
  const tokens = tokenize("> Apply #list and #paginated macros");
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.ok(prose.value.includes("#list"));
  assert.ok(prose.value.includes("#paginated"));
});

test("tokenize allows % symbols in prose text", () => {
  const tokens = tokenize("> white/10pct and 50% transparent");
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.ok(prose.value.includes("50%"));
  assert.ok(prose.value.includes("10pct"));
});

test("tokenize allows + symbol in prose text", () => {
  const tokens = tokenize("> HTML + CSS with progressive JS");
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.ok(prose.value.includes("+"));
});

test("tokenize allows URLs in prose text", () => {
  const tokens = tokenize("> See https://github.com/pactia-lang/spec");
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.ok(prose.value.includes("https://github.com/pactia-lang/spec"));
});

test("tokenize allows CSS-like dashed identifiers in prose text", () => {
  const tokens = tokenize("> Use --bg (#050505) and --text (#c8c8c8)");
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.ok(prose.value.includes("--bg"));
  assert.ok(prose.value.includes("--text"));
});

test("tokenize allows Unicode characters in prose text", () => {
  const tokens = tokenize("> Hidden on mobile, visible \u2265 56rem");
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.ok(prose.value.includes("\u2265"));
});

test("tokenize handles empty prose line", () => {
  const tokens = tokenize("> ");
  assert.ok(tokens.some((t) => t.type === TokenType.GT));
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.equal(prose.value, " ");
});

test("tokenize handles prose at end of file without newline", () => {
  const tokens = tokenize("> trailing prose without newline");
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.equal(prose.value, " trailing prose without newline");
});

test("tokenize handles multiple consecutive prose lines", () => {
  const tokens = tokenize("> First line\n> Second line\n> Third line");
  const proseTexts = tokens.filter((t) => t.type === TokenType.PROSE_TEXT);
  assert.equal(proseTexts.length, 3);
  assert.ok(proseTexts[0].value.includes("First line"));
  assert.ok(proseTexts[1].value.includes("Second line"));
  assert.ok(proseTexts[2].value.includes("Third line"));
});

test("tokenize handles multiline prose >> ... >>", () => {
  const tokens = tokenize(">> Line one\nLine two >>");
  const gtTokens = tokens.filter((t) => t.type === TokenType.GT);
  assert.equal(gtTokens.length, 4); // two opening, two closing
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.ok(prose.value.includes("Line one"));
  assert.ok(prose.value.includes("Line two"));
});

test("tokenize allows all common prose characters in single line", () => {
  const tokens = tokenize(
    "> Email: user@example.com, price $5.00 (50% off!), path /api/v1/items?page=1&sort=asc"
  );
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.ok(prose.value.includes("user@example.com"));
  assert.ok(prose.value.includes("$5.00"));
  assert.ok(prose.value.includes("50%"));
  assert.ok(prose.value.includes("/api/v1/items?page=1&sort=asc"));
});

test("tokenize prose preserves leading whitespace", () => {
  const tokens = tokenize(">   indented text");
  const prose = tokens.find((t) => t.type === TokenType.PROSE_TEXT);
  assert.ok(prose);
  assert.equal(prose.value, "   indented text");
});
