import { PactiaSyntaxError } from "../lexer/tokens.js";
import { findMatchingBrace } from "../kernel/brace.js";
import { extractProseLines, proseToText } from "../kernel/text.js";
import type { MustDecl } from "./types.js";

interface ServiceRegion {
  readonly name: string;
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

function collectServiceRegions(source: string): ServiceRegion[] {
  const regions: ServiceRegion[] = [];
  const pattern = /\bservice\s+([A-Za-z][\w]*)\s*\{/g;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    const name = match[1]!;
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(source, openBrace);
    regions.push({
      name,
      bodyStart: openBrace + 1,
      bodyEnd: closeBrace,
    });
    match = pattern.exec(source);
  }
  return regions;
}

function serviceForOffset(regions: readonly ServiceRegion[], offset: number): string | undefined {
  for (const region of regions) {
    if (offset >= region.bodyStart && offset < region.bodyEnd) {
      return region.name;
    }
  }
  return undefined;
}

function stripFieldValue(value: string): string {
  let trimmed = value.trim();
  if (trimmed.endsWith(",")) {
    trimmed = trimmed.slice(0, -1).trim();
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseMustBody(body: string, service: string, line: number): MustDecl {
  const onMatch = /on:\s*([\w.]+)/.exec(body);
  const proseLines = extractProseLines(body);
  const text = proseToText(proseLines);

  if (onMatch && proseLines.length > 0) {
    return {
      service,
      on: onMatch[1]!,
      lines: proseLines,
    };
  }

  if (text) {
    return { service, text };
  }

  throw new PactiaSyntaxError("Expected on: trigger and > outcome lines in @must", line, 0);
}

/** Extract `@must { }` blocks and attribute each to its enclosing service. */
export function extractMustObligations(source: string): MustDecl[] {
  const obligations: MustDecl[] = [];
  const serviceRegions = collectServiceRegions(source);
  const pattern = /@must(?:\s+[\w.-]+)?\s*\{/g;
  let match: RegExpExecArray | null = pattern.exec(source);

  while (match) {
    const openBrace = match.index + match[0].length - 1;
    const service = serviceForOffset(serviceRegions, openBrace);
    if (!service) {
      throw new PactiaSyntaxError("@must must appear inside a service block", 0, match.index);
    }

    const headerMatch = /@must\s+([\w.-]+)\s*\{/.exec(source.slice(match.index, openBrace + 1));
    const closeBrace = findMatchingBrace(source, openBrace);
    const body = source.slice(openBrace + 1, closeBrace);
    const line = source.slice(0, match.index).split("\n").length;
    const obligation = parseMustBody(body, service, line);
    obligations.push(headerMatch?.[1] ? { ...obligation, id: headerMatch[1] } : obligation);
    match = pattern.exec(source);
  }

  return obligations;
}
