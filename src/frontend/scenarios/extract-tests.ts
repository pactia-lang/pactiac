import { PactiaSyntaxError } from "../lexer/tokens.js";
import { findMatchingBrace } from "../kernel/brace.js";
import type { ScenarioDecl } from "./types.js";

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

function parseTestBody(body: string, service: string, line: number): ScenarioDecl {
  const lines = body
    .split("\n")
    .map((lineText) => lineText.trim())
    .filter((lineText) => lineText.length > 0 && !lineText.startsWith(">"));

  const nameFromField = lines.find((lineText) => lineText.startsWith("name:"));
  const nameFromString = lines.find((lineText) => lineText.startsWith('"'));
  let name: string | undefined;
  if (nameFromField) {
    name = stripFieldValue(nameFromField.slice("name:".length));
  } else if (nameFromString) {
    const nameMatch = /^"([^"]+)"/.exec(nameFromString);
    name = nameMatch?.[1];
  }
  if (!name) {
    throw new PactiaSyntaxError("Expected name: or quoted name in @test", line, 0);
  }

  const whenField = lines.find((lineText) => lineText.startsWith("when:"));
  const whenClause = lines.find((lineText) => lineText.startsWith("When "));
  const thenField = lines.find((lineText) => lineText.startsWith("then:"));
  const thenClause = lines.find((lineText) => lineText.startsWith("Then "));

  const whenText = whenField
    ? stripFieldValue(whenField.slice("when:".length))
    : whenClause?.slice("When ".length).trim();
  const thenText = thenField
    ? stripFieldValue(thenField.slice("then:".length))
    : thenClause?.slice("Then ".length).trim();

  if (!whenText || !thenText) {
    throw new PactiaSyntaxError("Expected when: and then: assignments in @test", line, 0);
  }

  return {
    name,
    steps: [],
    service,
    whenText,
    thenText,
  };
}

/** Extract `@test { }` blocks and attribute each to its enclosing service. */
export function extractScenarios(source: string): ScenarioDecl[] {
  const scenarios: ScenarioDecl[] = [];
  const serviceRegions = collectServiceRegions(source);
  const pattern = /@test(?:\s+[\w.-]+)?\s*\{/g;
  let match: RegExpExecArray | null = pattern.exec(source);

  while (match) {
    const openBrace = match.index + match[0].length - 1;
    const service = serviceForOffset(serviceRegions, openBrace);
    if (!service) {
      throw new PactiaSyntaxError("@test must appear inside a service block", 0, match.index);
    }

    const headerMatch = /@test\s+([\w.-]+)\s*\{/.exec(source.slice(match.index, openBrace + 1));
    const closeBrace = findMatchingBrace(source, openBrace);
    const body = source.slice(openBrace + 1, closeBrace);
    const line = source.slice(0, match.index).split("\n").length;
    const scenario = parseTestBody(body, service, line);
    scenarios.push(headerMatch?.[1] ? { ...scenario, id: headerMatch[1] } : scenario);
    match = pattern.exec(source);
  }

  return scenarios;
}
