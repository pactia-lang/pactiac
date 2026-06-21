import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assembleWorkspace } from "../src/frontend/workspace/assemble.js";
import { compileSource } from "../src/application/compile-source.js";

const repoRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(repoRoot, "test/fixtures/expected/relay");
const sourcePath = join(repoRoot, "test/fixtures/kernel/relay.pactia");
const workspaceRoot = join(repoRoot, "test/fixtures/workspace/relay");

const source = readFileSync(sourcePath, "utf8");
assembleWorkspace(workspaceRoot);
const { files } = compileSource({
  source,
  workspaceRoot,
  entryFile: "product.pactia",
});

for (const [relativePath, content] of files) {
  const target = join(outputRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

console.log(`Generated ${files.size} golden files under test/fixtures/expected/relay/`);
