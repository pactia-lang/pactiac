import { existsSync, readFileSync } from "node:fs";
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

function candidatePaths(id: TestFixtureId): readonly string[] {
  const relative = FIXTURE_RELATIVE[id];
  const paths: string[] = [
    resolve(testDir, "fixtures", relative),
  ];

  if (process.env.PACTIA_SPEC_ROOT) {
    paths.push(resolve(process.env.PACTIA_SPEC_ROOT, "fixtures", relative));
  }

  paths.push(resolve(testDir, "..", "spec", "fixtures", relative));
  return paths;
}

export function resolveTestFixture(id: TestFixtureId): string {
  const found = candidatePaths(id).find((path) => existsSync(path));
  if (found) {
    return found;
  }

  throw new Error(
    `Missing test fixture ${id}. Tried:\n${candidatePaths(id).map((p) => `  - ${p}`).join("\n")}`,
  );
}

export function readTestFixture(id: TestFixtureId): string {
  return readFileSync(resolveTestFixture(id), "utf8");
}
