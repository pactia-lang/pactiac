import { IrMerge } from "../../domain/ir-merge.js";

/** Optional merge override per kernel tag name — path is always {@link IrBodySlot.BodyArray}. */
export interface KernelTagIrMergeRule {
  readonly merge: IrMerge;
}

/**
 * Kernel tag merge hints (@pactia/kernel).
 * Container path is always `body[]` (source order); see spec/docs/compilation.md.
 */
export const KERNEL_TAG_IR_MERGE: Readonly<Record<string, KernelTagIrMergeRule>> = {
  output: { merge: IrMerge.MergeIntoHost },
  input: { merge: IrMerge.MergeIntoHost },
  throws: { merge: IrMerge.MergeIntoHost },
  public: { merge: IrMerge.MergeIntoHost },
  pk: { merge: IrMerge.FieldAnnotation },
  nullable: { merge: IrMerge.FieldAnnotation },
  unique: { merge: IrMerge.FieldAnnotation },
  pii: { merge: IrMerge.FieldAnnotation },
};

export function kernelTagIrMerge(tagName: string): KernelTagIrMergeRule | undefined {
  return KERNEL_TAG_IR_MERGE[tagName];
}
