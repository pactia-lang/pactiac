export function stripFieldValue(value: string): string {
  let trimmed = value.trim();
  if (trimmed.endsWith(",")) {
    trimmed = trimmed.slice(0, -1).trim();
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function extractProseLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(">"))
    .map((line) => line.slice(1).trim());
}

export function proseToGuidance(lines: readonly string[]): string | string[] | undefined {
  if (lines.length === 0) return undefined;
  return lines.length === 1 ? lines[0]! : [...lines];
}

export function proseToText(lines: readonly string[]): string | undefined {
  if (lines.length === 0) return undefined;
  return lines.join("\n");
}

export function serviceFileStem(serviceName: string): string {
  const withoutSuffix = serviceName.endsWith("Service")
    ? serviceName.slice(0, -"Service".length)
    : serviceName;
  return withoutSuffix.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

export function scalarTypeToIr(typeName: string): string {
  const map: Record<string, string> = {
    uuid: "UUID",
    string: "STRING",
    int: "INTEGER",
    integer: "INTEGER",
    decimal: "DECIMAL",
    boolean: "BOOLEAN",
    datetime: "DATETIME",
    json: "JSON",
  };
  return map[typeName.toLowerCase()] ?? typeName.toUpperCase();
}

export function normalizeTopologyMode(mode: string): string {
  const upper = mode.toUpperCase().replace(/-/g, "_");
  if (upper === "MICROSERVICES" || upper === "MODULAR_MONOLITH") return upper;
  return mode;
}

export function normalizeTenancyMode(mode: string): string {
  if (mode.toLowerCase() === "single") return "SINGLE_TENANT";
  if (mode.toLowerCase() === "multi") return "MULTI_TENANT";
  return mode.toUpperCase();
}

export function normalizeDirection(direction: string): string {
  return direction.toUpperCase();
}

export function normalizeAuthType(type: string): string {
  return type.toUpperCase().replace(/-/g, "_");
}
