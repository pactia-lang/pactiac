import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type Diagnostic, Provenance } from "../diagnostics/diagnostic.js";
import { detectPactiaVersion } from "./version.js";
import { compileSource } from "../application/compile-source.js";
import { discoverWorkspace } from "../frontend/workspace/discover.js";
import { mergeWorkspaceSources } from "../frontend/workspace/merge.js";

export interface CompileResult {
  /** Relative output paths under the IR workspace root. */
  readonly files: ReadonlyMap<string, string>;
  /** Provenance + gap report for every lowered fact that was not authored. */
  readonly diagnostics: readonly Diagnostic[];
}

function assertSupportedVersion(source: string): void {
  const version = detectPactiaVersion(source);
  if (version !== "1.0" && !version.startsWith("1.0.")) {
    throw new Error(`Unsupported pactia version: ${version}. Expected pactia 1.0`);
  }
}

function resolveWorkspaceRoot(explicit?: string): string {
  if (explicit) return explicit;
  const fromEnv = process.env["PACTIA_WORKSPACE_ROOT"];
  if (fromEnv) return resolve(fromEnv);
  return process.cwd();
}

/** Compile Pactia source text to a module-scoped IR workspace. */
export function compile(source: string, workspaceRoot?: string): CompileResult {
  assertSupportedVersion(source);
  return compileSource({
    source,
    workspaceRoot: resolveWorkspaceRoot(workspaceRoot),
    entryFile: "product.pactia",
  });
}

/** Compile a multi-file Pactia workspace directory to module-scoped IR. */
export function compileWorkspace(workspaceRoot: string): CompileResult {
  const root = resolve(workspaceRoot);
  const productSource = readFileSync(join(root, "product.pactia"), "utf8");
  assertSupportedVersion(productSource);

  const files = discoverWorkspace(root);
  const merged = mergeWorkspaceSources(files);
  return compileSource({
    source: merged.source,
    workspaceRoot: root,
    entryFile: merged.entry,
  });
}

export { assembleWorkspace } from "../frontend/workspace/assemble.js";

function findWorkspaceRootFromInput(inputPath: string): string | undefined {
  let dir = dirname(resolve(inputPath));
  const root = dirname(dir);
  while (dir !== root) {
    if (existsSync(join(dir, "pactia.lock"))) return dir;
    dir = dirname(dir);
  }
  return undefined;
}

/** Resolve workspace root for CLI `-i` compiles (lockfile directory or env). */
export function workspaceRootForInput(inputPath: string): string {
  return findWorkspaceRootFromInput(inputPath) ?? resolveWorkspaceRoot();
}
