import type { WorkspaceIr } from "../domain/workspace-ir.js";
import type { Diagnostic } from "../domain/diagnostics.js";

export interface IrValidatorInput {
  readonly workspace: WorkspaceIr;
}

export interface IrValidatorResult {
  readonly diagnostics: readonly Diagnostic[];
}

export interface IrValidator {
  validate(input: IrValidatorInput): IrValidatorResult;
}
