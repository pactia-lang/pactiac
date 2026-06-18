import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../packages/pactiac/dist/compile.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repoRoot, "test/fixtures/expected/fleet");
const sourcePath = join(repoRoot, "test/fixtures/kernel/fleet-management-v2.pactia");
const source = readFileSync(sourcePath, "utf8");
const { files } = compile(source);

for (const [relativePath, content] of files) {
  const fullPath = join(outputRoot, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
  process.stdout.write(`wrote ${relativePath}\n`);
}

console.log(`Generated ${files.size} golden files under test/fixtures/expected/fleet/`);
