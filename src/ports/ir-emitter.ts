import type { WorkspaceIrFiles } from "../domain/workspace-ir.js";

export interface IrEmitterInput {
  readonly workspace: WorkspaceIrFiles;
  readonly outputRoot: string;
}

export interface IrEmitterResult {
  readonly writtenPaths: readonly string[];
}

export interface IrEmitter {
  emit(input: IrEmitterInput): IrEmitterResult;
}

export interface IrEmitterSync {
  emit(input: IrEmitterInput): IrEmitterResult;
}
