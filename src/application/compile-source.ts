import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CompilePhase } from "../domain/compile-phase.js";
import { DiagnosticSeverity, hasErrors, type Diagnostic } from "../domain/index.js";
import type { ProvenanceGap } from "../domain/diagnostics.js";
import { Provenance } from "../domain/provenance.js";
import type { CompileResult } from "../compile/compile.js";
import { CompilePipeline } from "./compile-pipeline.js";
import { createDefaultCompilePipelinePorts } from "./default-compile-ports.js";

function toProvenanceGap(d: Diagnostic): ProvenanceGap {
  return {
    provenance: Provenance.NotDerivable,
    target: d.target ?? d.code,
    message: d.message,
  };
}

function mapDiagnostics(diagnostics: readonly Diagnostic[]): CompileResult["diagnostics"] {
  return diagnostics.map((d) =>
    d.severity === DiagnosticSeverity.Error
      ? toProvenanceGap(d)
      : {
          provenance: Provenance.Pactia,
          target: d.target ?? d.code,
          message: d.message,
        },
  );
}

export interface CompileSourceInput {
  readonly source: string;
  readonly workspaceRoot: string;
  readonly entryFile?: string;
}

/** Compile monolith or workspace-merged source through the v2 pipeline. */
export function compileSource(input: CompileSourceInput): CompileResult {
  const entryFile = input.entryFile ?? "product.pactia";
  const lockPath = join(input.workspaceRoot, "pactia.lock");
  const lockSource = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : undefined;

  const result = new CompilePipeline({
    ports: createDefaultCompilePipelinePorts(),
    stopAfterPhase: CompilePhase.Lower,
  }).run({
    workspaceRoot: input.workspaceRoot,
    entryFile,
    source: input.source,
  });

  return {
    files: result.files,
    diagnostics: mapDiagnostics(result.diagnostics),
  };
}
