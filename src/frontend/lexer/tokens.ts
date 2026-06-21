export enum TokenType {
  IDENT = "IDENT",
  STRING = "STRING",
  NUMBER = "NUMBER",
  PATH = "PATH",
  ARROW = "ARROW",
  LBRACE = "LBRACE",
  RBRACE = "RBRACE",
  LBRACKET = "LBRACKET",
  RBRACKET = "RBRACKET",
  COMMA = "COMMA",
  COLON = "COLON",
  QUESTION = "QUESTION",
  CARET = "CARET",
  STAR = "STAR",
  HASH = "HASH",
  GT = "GT",
  LT = "LT",
  LPAREN = "LPAREN",
  RPAREN = "RPAREN",
  SEMICOLON = "SEMICOLON",
  EQUALS = "EQUALS",
  EOF = "EOF",
}

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly line: number;
  readonly col: number;
}

export class PactiaSyntaxError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly col: number,
  ) {
    super(`${message} (line ${line}, col ${col})`);
    this.name = "PactiaSyntaxError";
  }
}

const SINGLE_CHAR_TOKENS: Readonly<Record<string, TokenType>> = {
  "{": TokenType.LBRACE,
  "}": TokenType.RBRACE,
  "[": TokenType.LBRACKET,
  "]": TokenType.RBRACKET,
  ",": TokenType.COMMA,
  ":": TokenType.COLON,
  "?": TokenType.QUESTION,
  "^": TokenType.CARET,
  "*": TokenType.STAR,
  "#": TokenType.HASH,
  ">": TokenType.GT,
  "<": TokenType.LT,
  "(": TokenType.LPAREN,
  ")": TokenType.RPAREN,
  ";": TokenType.SEMICOLON,
  "=": TokenType.EQUALS,
};

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_.\-]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isPathPart(ch: string): boolean {
  return /[A-Za-z0-9_/:{}.\-]/.test(ch);
}

/**
 * Deterministic, dependency-free tokenizer for the Pactia kernel subset.
 * No lookahead heuristics beyond a fixed two-character arrow; every byte maps
 * to exactly one token so the same source always produces the same tokens.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (): string => {
    const ch = source[i] ?? "";
    i += 1;
    if (ch === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
    return ch;
  };

  while (i < source.length) {
    const startLine = line;
    const startCol = col;
    const ch = source[i] ?? "";

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }

    // Block comments: /* ... */
    if (ch === "/" && source[i + 1] === "*") {
      advance();
      advance();
      while (
        i < source.length &&
        !(source[i] === "*" && source[i + 1] === "/")
      ) {
        advance();
      }
      if (i < source.length) {
        advance();
        advance();
      }
      continue;
    }

    // Line comments: //
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") advance();
      continue;
    }

    // String literal
    if (ch === '"') {
      advance();
      let value = "";
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\n") {
          throw new PactiaSyntaxError(
            "Unterminated string literal",
            startLine,
            startCol,
          );
        }
        value += advance();
      }
      if (i >= source.length) {
        throw new PactiaSyntaxError(
          "Unterminated string literal",
          startLine,
          startCol,
        );
      }
      advance(); // closing quote
      tokens.push({
        type: TokenType.STRING,
        value,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Package coordinate: @scope/name (emitted as a single IDENT token)
    if (ch === "@") {
      let value = "";
      while (i < source.length && /[A-Za-z0-9_/.@-]/.test(source[i] ?? ""))
        value += advance();
      tokens.push({
        type: TokenType.IDENT,
        value,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Arrow: ->
    if (ch === "-" && source[i + 1] === ">") {
      advance();
      advance();
      tokens.push({
        type: TokenType.ARROW,
        value: "->",
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Relative path: ./foo or ../foo
    if (ch === "." && (source[i + 1] === "/" || source[i + 1] === ".")) {
      let value = "";
      while (i < source.length && isPathPart(source[i] ?? ""))
        value += advance();
      tokens.push({
        type: TokenType.PATH,
        value,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Constant interpolation in prose: ${name}
    if (ch === "$" && source[i + 1] === "{") {
      let value = advance();
      value += advance();
      while (i < source.length && isIdentPart(source[i] ?? "")) {
        value += advance();
      }
      if (source[i] !== "}") {
        throw new PactiaSyntaxError(
          "Unterminated constant interpolation",
          startLine,
          startCol,
        );
      }
      value += advance();
      tokens.push({
        type: TokenType.IDENT,
        value,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Path: starts with '/'
    if (ch === "/") {
      let value = "";
      while (i < source.length && isPathPart(source[i] ?? ""))
        value += advance();
      tokens.push({
        type: TokenType.PATH,
        value,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Number (used for version constraints like 1.0)
    if (isDigit(ch)) {
      let value = "";
      while (i < source.length && /[0-9.%]/.test(source[i] ?? ""))
        value += advance();
      tokens.push({
        type: TokenType.NUMBER,
        value,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Identifier / keyword. Hyphens are allowed inside identifiers (e.g. the
    // stack id `rust-stack`, header `X-Device-Api-Key`) but never when they begin
    // the `->` arrow, which is matched earlier.
    if (isIdentStart(ch)) {
      let value = "";
      while (i < source.length) {
        const next = source[i] ?? "";
        if (next === "-" && source[i + 1] === ">") break;
        if (!isIdentPart(next)) break;
        value += advance();
      }
      tokens.push({
        type: TokenType.IDENT,
        value,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    const single = SINGLE_CHAR_TOKENS[ch];
    if (single !== undefined) {
      advance();
      tokens.push({ type: single, value: ch, line: startLine, col: startCol });
      continue;
    }

    // Unicode punctuation common in prose lines.
    if (ch === "→" || ch === "—" || ch === "…") {
      tokens.push({
        type: TokenType.IDENT,
        value: advance(),
        line: startLine,
        col: startCol,
      });
      continue;
    }

    throw new PactiaSyntaxError(
      `Unexpected character '${ch}'`,
      startLine,
      startCol,
    );
  }

  tokens.push({ type: TokenType.EOF, value: "", line, col });
  return tokens;
}
