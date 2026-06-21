import {
  DiagnosticCode,
  DiagnosticSeverity,
  defaultSeverityForCode,
} from "./diagnostic-code.js";
import type { SourceLocation } from "./syntax-tree.js";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly target?: string;
  readonly location?: SourceLocation;
}

export interface DiagnosticBag {
  readonly items: readonly Diagnostic[];
}

export function createDiagnostic(
  code: DiagnosticCode,
  message: string,
  options?: {
    readonly severity?: DiagnosticSeverity;
    readonly target?: string;
    readonly location?: SourceLocation;
  },
): Diagnostic {
  return {
    code,
    severity: options?.severity ?? defaultSeverityForCode(code),
    message,
    target: options?.target,
    location: options?.location,
  };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === DiagnosticSeverity.Error);
}

export function mergeDiagnostics(
  ...bags: readonly (readonly Diagnostic[])[]
): readonly Diagnostic[] {
  return bags.flat();
}

/** v0.1 provenance gap report — distinct from compiler Diagnostic above. */
export interface ProvenanceGap {
  readonly provenance: import("./provenance.js").Provenance;
  readonly target: string;
  readonly message: string;
}
