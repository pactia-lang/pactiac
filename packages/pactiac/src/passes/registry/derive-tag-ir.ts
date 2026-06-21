import { IrFile, irFileForPlacement } from "../../domain/ir-file.js";
import { IrMerge } from "../../domain/ir-merge.js";
import { PlacementTarget } from "../../domain/placement.js";
import type { IrSlot } from "../../domain/registry.js";
import type { DefDeclNode } from "../../domain/syntax-tree.js";

function defaultPathForPlacement(placement: PlacementTarget, modifier: boolean): string {
  if (placement === PlacementTarget.Field) return "fields[]";
  if (modifier) return "modifiers[]";
  switch (placement) {
    case PlacementTarget.Product:
      return "extensions[]";
    case PlacementTarget.Module:
      return "extensions[]";
    case PlacementTarget.Model:
      return "extensions[]";
    case PlacementTarget.Service:
      return "extensions[]";
    default: {
      const _exhaustive: never = placement;
      return _exhaustive;
    }
  }
}

function defaultMergeForDef(def: DefDeclNode): IrMerge {
  if (def.modifier) return IrMerge.MergeIntoHost;
  if (def.inTargets.includes(PlacementTarget.Field)) return IrMerge.FieldAnnotation;
  return IrMerge.MergeFields;
}

/** Derive IR slot metadata at package build when manifest has no pre-existing entry. */
export function deriveIrSlotForTag(def: DefDeclNode): IrSlot {
  const primaryIn = def.inTargets[0] ?? PlacementTarget.Service;
  const file = irFileForPlacement(primaryIn) ?? IrFile.Service;
  return {
    file,
    path: defaultPathForPlacement(primaryIn, def.modifier),
    merge: defaultMergeForDef(def),
  };
}
