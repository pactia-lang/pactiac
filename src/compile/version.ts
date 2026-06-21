export function detectPactiaVersion(source: string): string {
  const match = /^\s*pactia\s+([0-9]+(?:\.[0-9]+)?)/m.exec(source);
  return match?.[1] ?? "1.0";
}
