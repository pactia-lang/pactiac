import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { discoverWorkspace } from "./discover.js";
import { mergeWorkspaceSources } from "./merge.js";
import {
  readTestFixture,
  repoRoot,
  TestFixtureId,
} from "../../../test/fixture-paths.js";

const relayWorkspaceRoot = join(repoRoot, "test/fixtures/workspace/relay");

test("mergeAttachedWorkspace produces monolith-equivalent kernel source", () => {
  const files = discoverWorkspace(relayWorkspaceRoot);
  const merged = mergeWorkspaceSources(files);
  const monolith = readTestFixture(TestFixtureId.Relay);

  assert.match(merged.source, /product Relay/);
  assert.match(merged.source, /module orders/);
  assert.match(merged.source, /service OrderService/);
  assert.match(merged.source, /@api list_orders/);
  assert.match(merged.source, /#rust-stack/);
  assert.match(merged.source, /@@output OrderListResponse/);

  const mergedModuleBody =
    /module orders\s*\{([\s\S]*)\n  \}/.exec(merged.source)?.[1] ?? "";
  assert.match(mergedModuleBody, /@actor operators/);
  assert.match(mergedModuleBody, /@entity Order/);
  assert.match(mergedModuleBody, /#database/);
});

test("mergeAttachedWorkspace matches monolith structure for relay", () => {
  const files = discoverWorkspace(relayWorkspaceRoot);
  const merged = mergeWorkspaceSources(files);
  const monolith = readTestFixture(TestFixtureId.Relay);

  const normalize = (source: string): string =>
    source
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\s+/g, " ")
      .trim();

  assert.equal(normalize(merged.source), normalize(monolith));
});
