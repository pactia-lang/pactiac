import { PactiaSyntaxError, type Token, TokenType } from "../../frontend/lexer/tokens.js";

export class TokenStream {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  peek(offset = 0): Token {
    return this.tokens[this.index + offset] ?? this.tokens[this.tokens.length - 1]!;
  }

  advance(): Token {
    const token = this.peek();
    if (token.type !== TokenType.EOF) this.index += 1;
    return token;
  }

  atEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  match(type: TokenType, value?: string): boolean {
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    this.advance();
    return true;
  }

  expect(type: TokenType, message: string, value?: string): Token {
    const token = this.peek();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new PactiaSyntaxError(message, token.line, token.col);
    }
    return this.advance();
  }

  check(type: TokenType, value?: string): boolean {
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  location(file: string): { readonly file: string; readonly line: number; readonly col: number } {
    const token = this.peek();
    return { file, line: token.line, col: token.col };
  }
}

export function isModifierTagToken(value: string): boolean {
  return value.startsWith("@@");
}

export function isTagToken(value: string): boolean {
  return value.startsWith("@") && !value.includes("/");
}

export function tagNameFromToken(value: string): string {
  if (isModifierTagToken(value)) return value.slice(2);
  return value.startsWith("@") ? value.slice(1) : value;
}

export function isMacroInvocationStart(stream: TokenStream): boolean {
  if (!stream.check(TokenType.HASH, "#")) return false;
  const next = stream.peek(1);
  return next.type === TokenType.IDENT;
}
