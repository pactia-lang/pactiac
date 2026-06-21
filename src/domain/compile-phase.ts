/** Normative compile phases — spec/docs/compilation.md (0–13). */
export enum CompilePhase {
  AssembleWorkspace = 0,
  ValidateVersion = 1,
  Lex = 2,
  Parse = 3,
  ResolvePackages = 4,
  MergeDeclarations = 5,
  Bind = 6,
  ExpandMacros = 7,
  Validate = 8,
  CrossCheck = 9,
  Lower = 10,
  Infer = 11,
  IrValidate = 12,
  Emit = 13,
}

export const compilePhaseOrder: readonly CompilePhase[] = [
  CompilePhase.AssembleWorkspace,
  CompilePhase.ValidateVersion,
  CompilePhase.Lex,
  CompilePhase.Parse,
  CompilePhase.ResolvePackages,
  CompilePhase.MergeDeclarations,
  CompilePhase.Bind,
  CompilePhase.ExpandMacros,
  CompilePhase.Validate,
  CompilePhase.CrossCheck,
  CompilePhase.Lower,
  CompilePhase.Infer,
  CompilePhase.IrValidate,
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
    case CompilePhase.MergeDeclarations:
      return "merge-declarations";
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
    case CompilePhase.IrValidate:
      return "ir-validate";
    case CompilePhase.Emit:
      return "emit";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
