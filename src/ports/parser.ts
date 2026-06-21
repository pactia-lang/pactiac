import type { SyntaxTree } from "../domain/syntax-tree.js";

export interface ParseInput {
  readonly source: string;
  readonly entryFile: string;
}

export interface Parser {
  parse(input: ParseInput): SyntaxTree;
}

export interface LexResult {
  readonly strippedSource: string;
}

export interface Lexer {
  stripComments(source: string): LexResult;
}
