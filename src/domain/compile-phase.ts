/**
 * Normative compile phases — canonical list: spec/docs/compilation.md.
 *
 * Phases 0–7 are implemented in pactiac.
 * Phase 8 (CrossCheck) is reserved for future cross-module validation.
 * Phase 9 (Infer) is reserved for future deterministic inference (BSC / future pactiac).
 * Phase 10 (Emit) writes IR files.
 * After pactiac, optional BSC render/expand and `pactia build` context index are external.
 */
export enum CompilePhase {
  AssembleWorkspace = 0,
  ValidateVersion = 1,
  Lex = 2,
  Parse = 3,
  ResolvePackages = 4,
  BuildRegistry = 5,
  Bind = 6,
  ExpandMacros = 7,
  Validate = 8,
  /** Reserved — cross-module validation (future). Not called by the pipeline. */
  CrossCheck = 9,
  Lower = 10,
  /** Reserved — deterministic inference (future BSC / pactiac pass). Not called by the pipeline. */
  Infer = 11,
  Emit = 12,
}

export const compilePhaseOrder: readonly CompilePhase[] = [
  CompilePhase.AssembleWorkspace,
  CompilePhase.ValidateVersion,
  CompilePhase.Lex,
  CompilePhase.Parse,
  CompilePhase.ResolvePackages,
  CompilePhase.BuildRegistry,
  CompilePhase.Bind,
  CompilePhase.ExpandMacros,
  CompilePhase.Validate,
  CompilePhase.CrossCheck,
  CompilePhase.Lower,
  CompilePhase.Infer,
  CompilePhase.Emit,
];

export function compilePhaseLabel(phase: CompilePhase): string {
  switch (phase) {
    case CompilePhase.AssembleWorkspace:
      return "assemble-workspace";
    case CompilePhase.ValidateVersion:
      return "validate-version";
    case CompilePhase.Lex:
      return "lex";
    case CompilePhase.Parse:
      return "parse";
    case CompilePhase.ResolvePackages:
      return "resolve-packages";
    case CompilePhase.BuildRegistry:
      return "build-registry";
    case CompilePhase.Bind:
      return "bind";
    case CompilePhase.ExpandMacros:
      return "expand-macros";
    case CompilePhase.Validate:
      return "validate";
    case CompilePhase.CrossCheck:
      return "cross-check";
    case CompilePhase.Lower:
      return "lower";
    case CompilePhase.Infer:
      return "infer";
    case CompilePhase.Emit:
      return "emit";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
