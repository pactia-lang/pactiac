import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CompilePhase } from "../domain/compile-phase.js";
import { DiagnosticSeverity, hasErrors, type Diagnostic } from "../domain/index.js";
import type { ProvenanceGap } from "../domain/diagnostics.js";
import { Provenance } from "../domain/provenance.js";
import { CompilePipeline } from "./compile-pipeline.js";
import { createDefaultCompilePipelinePorts } from "./default-compile-ports.js";
import { discoverWorkspace } from "../frontend/workspace/discover.js";
import { mergeWorkspaceSources } from "../frontend/workspace/merge.js";
import type { CompileResult } from "../compile/compile.js";
import { compileIrWorkspace } from "../lower/ir.js";
import { assembleWorkspace } from "../frontend/workspace/assemble.js";
import { detectPactiaVersion } from "../compile/version.js";

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

function assertSupportedVersion(source: string): void {
  const version = detectPactiaVersion(source);
  if (version !== "1.0" && !version.startsWith("1.0.")) {
    throw new Error(`Unsupported pactia version: ${version}. Expected pactia 1.0`);
  }
}

/** Compile workspace via v2 pipeline (parse → lower). Falls back to v0.1 when v2 emits errors. */
export function compileWorkspaceV2(workspaceRoot: string): CompileResult {
  const productSource = readFileSync(join(workspaceRoot, "product.pactia"), "utf8");
  assertSupportedVersion(productSource);

  const files = discoverWorkspace(workspaceRoot);
  const merged = mergeWorkspaceSources(files);
  const pipeline = new CompilePipeline({
    ports: createDefaultCompilePipelinePorts(),
    stopAfterPhase: CompilePhase.Lower,
  });

  const result = pipeline.run({
    workspaceRoot,
    entryFile: merged.entry,
    source: merged.source,
  });

  const allDiagnostics = [...(merged.diagnostics ?? []), ...result.diagnostics];

  if (!hasErrors(allDiagnostics) && result.files.size > 0) {
    return {
      files: result.files,
      diagnostics: mapDiagnostics(allDiagnostics),
    };
  }

  const assembled = assembleWorkspace(workspaceRoot);
  const { files: legacyFiles, diagnostics: legacyDiagnostics } = compileIrWorkspace(merged.source, {
    entry: merged.entry,
    lockfileDigest: assembled.lockfileDigest,
    packagesResolved: assembled.lockfileDigest !== undefined,
    effectiveRegistry: assembled.effectiveRegistry,
    loadedPackages: assembled.loadedPackages,
  });

  return {
    files: legacyFiles,
    diagnostics: [...mapDiagnostics(allDiagnostics), ...legacyDiagnostics],
  };
}
