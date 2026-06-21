import type { BoundTree } from "../domain/bound-tree.js";
import type { Diagnostic, ProvenanceGap } from "../domain/diagnostics.js";
import type { EffectiveRegistry } from "../domain/registry.js";
import type { SyntaxTree } from "../domain/syntax-tree.js";
import type { WorkspaceIrFiles } from "../domain/workspace-ir.js";

/** Inputs shared across compile pipeline phases. */
export interface CompileContext {
  readonly workspaceRoot: string;
  readonly entryFile: string;
  readonly source: string;
}

export interface AssembledWorkspace {
  readonly context: CompileContext;
  readonly mergedSource: string;
}

export interface CompilePipelineResult {
  readonly files: ReadonlyMap<string, string>;
  readonly diagnostics: readonly Diagnostic[];
  readonly provenanceGaps: readonly ProvenanceGap[];
  readonly registry: EffectiveRegistry;
  readonly syntax?: SyntaxTree;
  readonly bound?: BoundTree;
  readonly lowered?: WorkspaceIrFiles;
}

export interface CompilePipelinePorts {
  readonly registryLoader: import("../ports/registry-loader.js").RegistryLoaderSync;
  readonly lockReader: import("../ports/lock-reader.js").LockReaderSync;
  readonly parser: import("../ports/parser.js").Parser;
  readonly irEmitter: import("../ports/ir-emitter.js").IrEmitterSync;
  readonly irValidator: import("../ports/ir-validator.js").IrValidator;
}

export interface CompilePipelineOptions {
  readonly ports: CompilePipelinePorts;
  readonly stopAfterPhase?: import("../domain/compile-phase.js").CompilePhase;
}
