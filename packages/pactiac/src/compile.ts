import { emitYaml } from "./emit.js";
import { type Diagnostic, Provenance } from "./diagnostics.js";
import { compileIrWorkspace } from "./lower-ir.js";
import { assembleWorkspace } from "./workspace/assemble.js";
import { detectPactiaVersion } from "./v2-test-parser.js";

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

/**
 * Compile Pactia source text to a module-scoped IR workspace. Pure and deterministic:
 * no LLM, no filesystem, no clock.
 */
export function compile(source: string): CompileResult {
  assertSupportedVersion(source);
  const { files, diagnostics } = compileIrWorkspace(source);
  return { files, diagnostics };
}

/**
 * Compile a multi-file Pactia workspace directory to module-scoped IR.
 */
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

/** @deprecated Legacy scenarios-only output path — use compile() module-scoped IR instead. */
export function compileScenariosOnly(source: string): CompileResult {
  const { files, diagnostics } = compileIrWorkspace(source);
  const legacy = new Map<string, string>();
  for (const [path, content] of files) {
    if (path.endsWith(".service.yaml")) {
      legacy.set("scenarios.yaml", content);
      break;
    }
  }
  return {
    files: legacy,
    diagnostics: [
      ...diagnostics,
      {
        provenance: Provenance.NOT_DERIVABLE,
        target: "compile.legacy",
        message: "compileScenariosOnly is deprecated; use compile() for full IR workspace output",
      },
    ],
  };
}

export function compileToYamlMap(source: string): Map<string, string> {
  return new Map(compile(source).files);
}

export { emitYaml };
