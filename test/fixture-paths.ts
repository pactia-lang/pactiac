import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export enum TestFixtureId {
  Relay = "relay",
}

const FIXTURE_RELATIVE: Record<TestFixtureId, string> = {
  [TestFixtureId.Relay]: "kernel/relay.pactia",
};

const testDir = dirname(fileURLToPath(import.meta.url));

/** Repository root (package.json, src/, test/). */
export const repoRoot = resolve(testDir, "..");

export function resolveTestFixture(id: TestFixtureId): string {
  const path = resolve(testDir, "fixtures", FIXTURE_RELATIVE[id]);
  return path;
}

export function readTestFixture(id: TestFixtureId): string {
  return readFileSync(resolveTestFixture(id), "utf8");
}
