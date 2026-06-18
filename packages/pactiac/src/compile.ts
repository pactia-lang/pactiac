import { emitYaml } from "./emit.js";
import { type Diagnostic, Provenance } from "./diagnostics.js";
import { compileIrWorkspace } from "./lower-ir.js";
import { detectPactiaVersion } from "./v2-test-parser.js";

export interface CompileResult {
  /** Relative output paths under the IR workspace root. */
  readonly files: ReadonlyMap<string, string>;
  /** Provenance + gap report for every lowered fact that was not authored. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Compile Pactia source text to a module-scoped IR workspace. Pure and deterministic:
 * no LLM, no filesystem, no clock.
 */
export function compile(source: string): CompileResult {
  const version = detectPactiaVersion(source);
  if (version !== "1.0" && !version.startsWith("1.0.")) {
    throw new Error(`Unsupported pactia version: ${version}. Expected pactia 1.0`);
  }

  const { files, diagnostics } = compileIrWorkspace(source);
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
