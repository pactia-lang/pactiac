import assert from "node:assert/strict";
import { test } from "node:test";
import { SyntaxNodeKind } from "../../domain/syntax-tree.js";
import type {
  BoundTreeItem,
  ProseNode,
  FieldLineNode,
  TagBodyItem,
} from "../../domain/syntax-tree.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { BoundTreeItem as BoundTreeItemType } from "../../domain/bound-tree.js";
import { BoundNodeKind } from "../../domain/bound-tree.js";
import { PlacementTarget } from "../../domain/placement.js";
import {
  collectProse,
  collectBlockProse,
  collectServiceProse,
  mergeAtIrPath,
  mergeTagBlock,
} from "./ir-slot-writer.js";
import { IrMerge } from "../../domain/ir-merge.js";
import { IrFile, RegistryEntryKind, PlacementTarget } from "../../domain/index.js";
import type { RegistryTagEntry } from "../../domain/registry.js";

function proseItem(text: string, multiline = false): ProseNode {
  return {
    kind: SyntaxNodeKind.Prose,
    text,
    multiline,
    location: { file: "test.pactia", line: 1, col: 1 },
  };
}

function fieldItem(name: string, value: string): FieldLineNode {
  return {
    kind: SyntaxNodeKind.FieldLine,
    name,
    value,
    required: false,
    location: { file: "test.pactia", line: 1, col: 1 },
  };
}

test("collectBlockProse joins prose items with space", () => {
  const items: BoundTreeItem[] = [
    proseItem("hello"),
    proseItem("world"),
  ];
  const result = collectBlockProse(items);
  assert.equal(result, "hello world");
});

test("collectBlockProse returns undefined for no prose", () => {
  const items: BoundTreeItem[] = [
    fieldItem("method", "GET"),
    fieldItem("path", "/ping"),
  ];
  const result = collectBlockProse(items);
  assert.equal(result, undefined);
});

test("collectBlockProse handles empty prose text", () => {
  const items: BoundTreeItem[] = [
    proseItem(""),
    proseItem("valid"),
  ];
  const result = collectBlockProse(items);
  assert.equal(result, "valid");
});

test("collectServiceProse delegates to collectBlockProse", () => {
  const items: BoundTreeItem[] = [
    proseItem("service guide"),
  ];
  const result = collectServiceProse(items);
  assert.equal(result, "service guide");
});

test("collectProse joins prose items with newline", () => {
  const items: TagBodyItem[] = [
    proseItem("first"),
    proseItem("second"),
  ];
  const result = collectProse(items);
  assert.equal(result, "first\nsecond");
});

test("collectProse returns undefined for no prose", () => {
  const items: TagBodyItem[] = [
    fieldItem("method", "GET"),
  ];
  const result = collectProse(items);
  assert.equal(result, undefined);
});

test("mergeAtIrPath sets value when existing is not mergeable", () => {
  const root: Record<string, unknown> = {};
  mergeAtIrPath(root, "simple.path", { key: "val" });
  assert.deepEqual(root, { simple: { path: { key: "val" } } });
});

test("mergeAtIrPath appends to arrays with [] path", () => {
  const root: Record<string, unknown> = {};
  mergeAtIrPath(root, "body[]", { tag: "api" });
  assert.deepEqual(root, { body: [{ tag: "api" }] });
  mergeAtIrPath(root, "body[]", { tag: "output" });
  assert.deepEqual(root, { body: [{ tag: "api" }, { tag: "output" }] });
});

test("mergeTagBlock with MergeFields merge strategy", () => {
  const entry: RegistryTagEntry = {
    kind: RegistryEntryKind.Tag,
    name: "api",
    source: "@pactia/kernel",
    in: [PlacementTarget.Service],
    fields: { required: ["method"], optional: [], modifier: false, openExtension: true },
    modifier: false,
    ir: { file: IrFile.Service, path: "details", merge: IrMerge.MergeFields },
  };
  const target: Record<string, unknown> = {};
  const bodyItems: BoundTreeItem[] = [
    fieldItem("method", "GET"),
    fieldItem("path", "/ping"),
  ];
  mergeTagBlock(target, entry, bodyItems);
  assert.deepEqual(target, { details: { method: "GET", path: "/ping" } });
});
