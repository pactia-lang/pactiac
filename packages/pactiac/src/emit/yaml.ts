import { stringify } from "yaml";

/**
 * Deterministic YAML serialization. Object key order is preserved exactly as the
 * lowering produced it, so the same Pactia source always yields byte-identical
 * output. `lineWidth: 0` disables line wrapping so long strings never reflow.
 */
export function emitYaml(value: unknown): string {
  return stringify(value, { indent: 2, lineWidth: 0 });
}
