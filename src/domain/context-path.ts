import { SyntaxNodeKind, type TagBodyItem } from "./syntax-tree.js";

export function stripQuotedPath(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Parse a context `path:` field value into a file path or explicit file group. */
export function parseContextPathField(raw: string | undefined): string | readonly string[] | undefined {
  if (raw === undefined || raw.length === 0) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const close = trimmed.lastIndexOf("]");
    const inner = close > 0 ? trimmed.slice(1, close) : trimmed.slice(1);
    return inner
      .split(",")
      .map((part) => stripQuotedPath(part))
      .filter((part) => part.length > 0);
  }
  return stripQuotedPath(trimmed);
}

export function collectContextGuidance(items: readonly TagBodyItem[]): string[] {
  const guidance: string[] = [];
  for (const item of items) {
    if (item.kind === SyntaxNodeKind.Prose && item.text.length > 0) {
      guidance.push(item.text);
    }
  }
  return guidance;
}
