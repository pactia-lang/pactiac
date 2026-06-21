import { type Diagnostic, Provenance } from "../diagnostics/diagnostic.js";
import { compileIrWorkspace } from "../lower/ir.js";
import { detectPactiaVersion } from "./version.js";
import { compileWorkspaceV2 } from "../application/compile-workspace-v2.js";

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

/** Compile Pactia source text to a module-scoped IR workspace. */
export function compile(source: string): CompileResult {
  assertSupportedVersion(source);
  const { files, diagnostics } = compileIrWorkspace(source);
  return { files, diagnostics };
}

/** Compile a multi-file Pactia workspace directory to module-scoped IR. */
export function compileWorkspace(workspaceRoot: string): CompileResult {
  return compileWorkspaceV2(workspaceRoot);
}