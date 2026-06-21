import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assembleWorkspace } from "../packages/pactiac/src/frontend/workspace/assemble.js";
import { compileIrWorkspace } from "../packages/pactiac/src/lower/ir.js";

const repoRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(repoRoot, "test/fixtures/expected/relay");
const sourcePath = join(repoRoot, "test/fixtures/kernel/relay.pactia");
const workspaceRoot = join(repoRoot, "test/fixtures/workspace/relay");

const source = readFileSync(sourcePath, "utf8");
const assembled = assembleWorkspace(workspaceRoot);
const { files } = compileIrWorkspace(source, {
  effectiveRegistry: assembled.effectiveRegistry,
  packagesResolved: assembled.lockfileDigest !== undefined,
  lockfileDigest: assembled.lockfileDigest,
  loadedPackages: assembled.loadedPackages,
});

for (const [relativePath, content] of files) {
  const target = join(outputRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

console.log(`Generated ${files.size} golden files under test/fixtures/expected/relay/`);
