import { emitYaml } from "./emit.js";
import { type Diagnostic, Provenance } from "./diagnostics.js";
import { lowerScenarios } from "./lower-scenarios.js";
import { detectPactiaVersion, extractV2Tests } from "./v2-test-parser.js";

export interface CompileResult {
  /** Relative output path (e.g. `services/fleet-service.yaml`) to YAML text. */
  readonly files: ReadonlyMap<string, string>;
  /** Provenance + gap report for every lowered fact that was not authored. */
  readonly diagnostics: readonly Diagnostic[];
}

function compileKernelPartial(source: string): CompileResult {
  const scenarios = extractV2Tests(source);
  const lowered = lowerScenarios(scenarios);
  const files = new Map<string, string>();
  files.set("scenarios.yaml", emitYaml(lowered));

  const diagnostics: Diagnostic[] = [
    {
      provenance: Provenance.NOT_DERIVABLE,
      target: "compile.1.0.partial",
      message:
        "Pactia 1.0 full kernel lowering is not implemented; only @test blocks were lowered to scenarios.yaml",
    },
  ];

  return { files, diagnostics };
}

/**
 * Compile Pactia source text to a BSC input workspace. Pure and deterministic:
 * no LLM, no filesystem, no clock.
 */
export function compile(source: string): CompileResult {
  const version = detectPactiaVersion(source);
  if (version === "1.0" || version.startsWith("1.0.")) {
    return compileKernelPartial(source);
  }

  throw new Error(`Unsupported pactia version: ${version}. Expected pactia 1.0`);
}
