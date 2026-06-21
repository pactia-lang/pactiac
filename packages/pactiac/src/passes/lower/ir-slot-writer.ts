import { IrMerge } from "../../domain/ir-merge.js";
import type { BoundTreeItem } from "../../domain/bound-tree.js";
import type { RegistryTagEntry } from "../../domain/registry.js";
import { SyntaxNodeKind, type FieldLineNode, type ProseNode, type TagBodyItem } from "../../domain/syntax-tree.js";
import { getAtPath, mergeDeep, parseScalarValue, setAtPath } from "../../lower/ir-path.js";

type WritableRecord = Record<string, unknown>;

export interface ParsedIrPath {
  readonly containerPath: string;
  readonly appendArray: boolean;
}

export function parseIrPath(path: string): ParsedIrPath {
  if (path.endsWith("[]")) {
    return { containerPath: path.slice(0, -2), appendArray: true };
  }
  return { containerPath: path, appendArray: false };
}

export function fieldLinesToObject(lines: readonly FieldLineNode[]): WritableRecord {
  const object: WritableRecord = {};
  for (const line of lines) {
    if (line.required) continue;
    if (line.value === undefined) continue;
    setAtPath(object, line.name, parseScalarValue(line.value));
  }
  return object;
}

type BodyFieldItem = FieldLineNode | ProseNode;

export function tagBodyItemsToObject(items: readonly TagBodyItem[]): WritableRecord {
  const object: WritableRecord = {};
  for (const item of items) {
    if (item.kind === SyntaxNodeKind.FieldLine) {
      if (item.required || item.value === undefined) continue;
      setAtPath(object, item.name, parseScalarValue(item.value));
      continue;
    }
    if (item.kind === SyntaxNodeKind.Prose && item.text.length > 0) {
      object["summary"] = item.text;
    }
  }
  return object;
}

export function boundLeafBodyToObject(items: readonly BoundTreeItem[]): WritableRecord {
  const object: WritableRecord = {};
  for (const item of items) {
    if (item.kind === SyntaxNodeKind.FieldLine) {
      appendBodyField(object, item);
      continue;
    }
    if (item.kind === SyntaxNodeKind.Prose && item.text.length > 0) {
      object["summary"] = item.text;
    }
  }
  return object;
}

function appendBodyField(object: WritableRecord, item: BodyFieldItem): void {
  if (item.kind !== SyntaxNodeKind.FieldLine) return;
  if (item.required || item.value === undefined) return;
  setAtPath(object, item.name, parseScalarValue(item.value));
}

export function primaryModifierField(entry: RegistryTagEntry): string | undefined {
  if (!entry.modifier) return undefined;
  return entry.fields.required[0] ?? entry.fields.optional[0];
}

export function appendHostObject(
  root: WritableRecord,
  slotPath: string,
  host: WritableRecord | string,
): void {
  if (slotPath.endsWith("[]")) {
    const arrayPath = slotPath.slice(0, -2);
    const existing = getAtPath(root, arrayPath);
    const array = Array.isArray(existing) ? [...existing] : [];
    array.push(host);
    setAtPath(root, arrayPath, array);
    return;
  }
  setAtPath(root, slotPath, host);
}

export function mergeAtIrPath(root: WritableRecord, slotPath: string, patch: WritableRecord): void {
  const { containerPath, appendArray } = parseIrPath(slotPath);
  if (appendArray) {
    appendHostObject(root, slotPath, patch);
    return;
  }
  const existing = getAtPath(root, containerPath);
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    mergeDeep(existing as WritableRecord, patch);
    return;
  }
  setAtPath(root, containerPath, { ...patch });
}

export function mergePrefixShorthand(
  target: WritableRecord,
  entry: RegistryTagEntry,
  shorthand: string,
): void {
  const field = primaryModifierField(entry);
  if (!field) return;
  const basePath = parseIrPath(entry.ir.path).containerPath;
  setAtPath(target, `${basePath}.${field}`, parseScalarValue(shorthand));
}

export function mergeTagBlock(
  target: WritableRecord,
  entry: RegistryTagEntry,
  bodyItems: readonly BoundTreeItem[],
): void {
  const patch = boundLeafBodyToObject(bodyItems);
  if (entry.ir.merge === IrMerge.MergeFields) {
    mergeAtIrPath(target, entry.ir.path, patch);
    return;
  }
  mergeDeep(target, patch);
}

export function collectProse(items: readonly TagBodyItem[]): string | undefined {
  const lines: string[] = [];
  for (const item of items) {
    if (item.kind === SyntaxNodeKind.Prose && item.text.length > 0) {
      lines.push(item.text);
    }
  }
  if (lines.length === 0) return undefined;
  return lines.join("\n");
}

export function collectBlockProse(items: readonly BoundTreeItem[]): string | undefined {
  for (const item of items) {
    if (item.kind === SyntaxNodeKind.Prose && item.text.length > 0) {
      return item.text;
    }
  }
  return undefined;
}

export function collectServiceProse(items: readonly BoundTreeItem[]): string | undefined {
  return collectBlockProse(items);
}
