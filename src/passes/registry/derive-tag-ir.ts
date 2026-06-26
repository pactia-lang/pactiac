import { IrBodySlot } from "../../domain/ir-body.js";
import { IrFile, irFileForPlacement } from "../../domain/ir-file.js";
import { IrMerge } from "../../domain/ir-merge.js";
import { PlacementTarget } from "../../domain/placement.js";
import type { IrSlot } from "../../domain/registry.js";
import type { DefDeclNode } from "../../domain/syntax-tree.js";
import { kernelTagIrMerge } from "./kernel-tag-ir-paths.js";

function defaultPathForPlacement(placement: PlacementTarget, modifier: boolean): string {
  if (placement === PlacementTarget.Field) return "fields[]";
  if (modifier) return "modifiers";
  return IrBodySlot.BodyArray;
}

function defaultMergeForDef(def: DefDeclNode): IrMerge {
  if (def.modifier) return IrMerge.MergeIntoHost;
  if (def.inTargets.includes(PlacementTarget.Field)) return IrMerge.FieldAnnotation;
  return IrMerge.AppendHost;
}

/** Derive IR slot from export def — one ordered `body[]` per scope; merge hints from kernel table. */
export function deriveIrSlotForTag(def: DefDeclNode): IrSlot {
  const primaryIn = def.inTargets[0] ?? PlacementTarget.Service;
  const file = irFileForPlacement(primaryIn) ?? IrFile.Service;
  const kernelRule = kernelTagIrMerge(def.name);
  return {
    file,
    path: defaultPathForPlacement(primaryIn, def.modifier),
    merge: kernelRule?.merge ?? defaultMergeForDef(def),
  };
}
