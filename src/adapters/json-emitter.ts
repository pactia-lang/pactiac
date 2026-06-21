import type { IrEmitterSync, IrEmitterInput, IrEmitterResult } from "../ports/ir-emitter.js";

/**
 * Deterministic JSON serialization. Object key order follows the lowering pass
 * insertion order so the same Pactia source yields byte-identical output.
 */
export function emitJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export class JsonIrEmitter implements IrEmitterSync {
  emit(input: IrEmitterInput): IrEmitterResult {
    return { writtenPaths: [...input.workspace.files.keys()] };
  }
}

export function emitIrFileMap(files: ReadonlyMap<string, unknown>): Map<string, string> {
  const emitted = new Map<string, string>();
  for (const [relativePath, value] of files) {
    emitted.set(relativePath, emitJson(value));
  }
  return emitted;
}
