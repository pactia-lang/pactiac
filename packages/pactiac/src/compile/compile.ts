import { type Diagnostic, Provenance } from "../diagnostics/diagnostic.js";
import { emitYaml } from "../emit/yaml.js";
import { assembleWorkspace } from "../frontend/workspace/assemble.js";
import { compileIrWorkspace } from "../lower/ir.js";
import { detectPactiaVersion } from "./version.js";

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
  const assembled = assembleWorkspace(workspaceRoot);
  assertSupportedVersion(assembled.merged.source);

  const hasLock = assembled.lockfileDigest !== undefined;
  const { files, diagnostics } = compileIrWorkspace(assembled.merged.source, {
    entry: assembled.merged.entry,
    lockfileDigest: assembled.lockfileDigest,
    packagesResolved: hasLock,
  });

  return { files, diagnostics };
}

export { emitYaml };
