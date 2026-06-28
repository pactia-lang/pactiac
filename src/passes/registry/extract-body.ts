/** Extract the body text between braces of an export block from source text. */
export function extractExportBody(
  sourceText: string,
  kind: string,
  name: string,
): string {
  if (!sourceText || !name) return "";
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`export\\s+${kind}\\s+${escaped}\\s*\\{`);
  const match = pattern.exec(sourceText);
  if (!match || match.index === undefined) return "";
  const openBrace = sourceText.indexOf("{", match.index);
  if (openBrace < 0) return "";
  let depth = 1;
  let i = openBrace + 1;
  while (i < sourceText.length && depth > 0) {
    if (sourceText[i] === "{") depth++;
    else if (sourceText[i] === "}") depth--;
    i++;
  }
  return sourceText.slice(openBrace + 1, i - 1).trim();
}