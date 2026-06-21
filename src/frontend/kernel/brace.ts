import { PactiaSyntaxError } from "../lexer/tokens.js";

export function findMatchingBrace(source: string, openBraceIndex: number): number {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new PactiaSyntaxError("Unclosed block", 0, 0);
}

export interface TagBlock {
  readonly id: string | undefined;
  readonly body: string;
  readonly start: number;
}

export function collectTagBlocks(source: string, tagName: string): TagBlock[] {
  const blocks: TagBlock[] = [];
  const pattern = new RegExp(`@${tagName}(?:\\s+([\\w.-]+))?\\s*\\{`, "g");
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    const id = match[1];
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(source, openBrace);
    blocks.push({
      id,
      body: source.slice(openBrace + 1, closeBrace),
      start: match.index,
    });
    match = pattern.exec(source);
  }
  return blocks;
}

export function extractBlockAfter(
  source: string,
  pattern: RegExp,
): { id: string; body: string } | undefined {
  const match = pattern.exec(source);
  if (!match) return undefined;
  const id = match[1]!;
  const openBrace = match.index + match[0].length - 1;
  const closeBrace = findMatchingBrace(source, openBrace);
  return { id, body: source.slice(openBrace + 1, closeBrace) };
}
