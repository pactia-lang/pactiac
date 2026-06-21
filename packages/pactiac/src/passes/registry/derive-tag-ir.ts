import { IrFile, irFileForPlacement } from "../../domain/ir-file.js";
import { IrMerge } from "../../domain/ir-merge.js";
import { PlacementTarget } from "../../domain/placement.js";
import type { IrSlot } from "../../domain/registry.js";
import type { DefDeclNode } from "../../domain/syntax-tree.js";

const TAG_IR_BY_NAME: Readonly<Record<string, IrSlot>> = {
  api: { file: IrFile.Service, path: "endpoints[]", merge: IrMerge.AppendHost },
  entity: { file: IrFile.Model, path: "entities[]", merge: IrMerge.AppendHost },
  enum: { file: IrFile.Model, path: "enums[]", merge: IrMerge.AppendHost },
  output: { file: IrFile.Service, path: "response", merge: IrMerge.MergeIntoHost },
  auth: { file: IrFile.Service, path: "auth", merge: IrMerge.MergeIntoHost },
  pk: { file: IrFile.Model, path: "fields[]", merge: IrMerge.FieldAnnotation },
  nullable: { file: IrFile.Model, path: "fields[]", merge: IrMerge.FieldAnnotation },
  surface: { file: IrFile.Service, path: "surfaces[]", merge: IrMerge.MergeFields },
  test: { file: IrFile.Service, path: "tests[]", merge: IrMerge.AppendHost },
  actor: { file: IrFile.Module, path: "actors[]", merge: IrMerge.AppendHost },
  rule: { file: IrFile.Module, path: "rules[]", merge: IrMerge.AppendHost },
  deploy: { file: IrFile.Module, path: "deployments[]", merge: IrMerge.AppendHost },
  environment: { file: IrFile.Module, path: "environments[]", merge: IrMerge.AppendHost },
  gate: { file: IrFile.Module, path: "gates[]", merge: IrMerge.AppendHost },
  security: { file: IrFile.Module, path: "security[]", merge: IrMerge.MergeFields },
  stack: { file: IrFile.Product, path: "stack", merge: IrMerge.MergeFields },
  topology: { file: IrFile.Product, path: "topology", merge: IrMerge.MergeFields },
  tenancy: { file: IrFile.Product, path: "tenancy", merge: IrMerge.MergeFields },
  guide: { file: IrFile.Product, path: "guidance[]", merge: IrMerge.AppendHost },
};

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

/** Derive IR slot metadata at package build when manifest has no pre-existing entry. */
export function deriveIrSlotForTag(def: DefDeclNode): IrSlot {
  const named = TAG_IR_BY_NAME[def.name];
  if (named) return named;

  const primaryIn = def.inTargets[0] ?? PlacementTarget.Service;
  const file = irFileForPlacement(primaryIn) ?? IrFile.Service;
  const merge = def.modifier ? IrMerge.MergeIntoHost : IrMerge.MergeFields;
  return {
    file,
    path: defaultPathForPlacement(primaryIn, def.modifier),
    merge,
  };
}
