/** Compile-time provenance and diagnostic reporting (shared by pactiac and future lowerers). */

export enum Provenance {
  Pactia = "Pactia",
  INFERRED = "INFERRED",
  STACK_DEFAULT = "STACK_DEFAULT",
  NOT_DERIVABLE = "NOT_DERIVABLE",
}

export interface Diagnostic {
  readonly provenance: Provenance;
  readonly target: string;
  readonly message: string;
}
