type WritableRecord = Record<string, unknown>;

export function parseScalarValue(raw: string): unknown {
  let trimmed = raw.trim();
  if (trimmed.endsWith(",")) {
    trimmed = trimmed.slice(0, -1).trim();
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner.length === 0) return [];
    return inner.split(",").map((part) => parseScalarValue(part.trim()));
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) return numeric;
  return trimmed.replace(/^["']|["']$/g, "");
}

const IR_ASSIGNMENT = /^([\w.]+):\s*(.+)$/;

export function parseIrAssignmentLine(line: string): { path: string; value: unknown } | undefined {
  const match = IR_ASSIGNMENT.exec(line.trim());
  if (!match) return undefined;
  return { path: match[1]!, value: parseScalarValue(match[2]!) };
}

export function substituteMacroArgs(template: string, args: readonly string[]): string {
  return template.replace(/\{\{(\d+)\}\}/g, (_match, index: string) => args[Number(index)] ?? "");
}

export function getAtPath(root: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = root;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as WritableRecord)[segment];
  }
  return current;
}

export function setAtPath(root: WritableRecord, path: string, value: unknown): void {
  const segments = path.split(".");
  let current: WritableRecord = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const next = current[segment];
    if (!next || typeof next !== "object") {
      const created: WritableRecord = {};
      current[segment] = created;
      current = created;
    } else {
      current = next as WritableRecord;
    }
  }
  current[segments[segments.length - 1]!] = value;
}

export function mergeDeep(target: WritableRecord, patch: WritableRecord): void {
  for (const [key, value] of Object.entries(patch)) {
    const existing = target[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      mergeDeep(existing as WritableRecord, value as WritableRecord);
    } else {
      target[key] = value;
    }
  }
}

export function pathPresent(root: unknown, path: string): boolean {
  const value = getAtPath(root, path);
  return value !== undefined && value !== null && value !== "";
}
