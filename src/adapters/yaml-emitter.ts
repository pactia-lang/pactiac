import { dump as yamlDump } from "js-yaml";
import type { IrEmitterSync, IrEmitterInput, IrEmitterResult } from "../ports/ir-emitter.js";

/**
 * Deterministic YAML serialization. Object key order follows the lowering pass
 * insertion order so the same Pactia source yields byte-identical output.
 */
export function emitYaml(value: unknown): string {
  return yamlDump(value, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }) as string;
}

export class YamlIrEmitter implements IrEmitterSync {
  emit(input: IrEmitterInput): IrEmitterResult {
    return { writtenPaths: [...input.workspace.files.keys()] };
  }
}