import { IrFile, irFileForPlacement } from "../../domain/ir-file.js";
import { IrMerge } from "../../domain/ir-merge.js";
import { PlacementTarget } from "../../domain/placement.js";
import type { IrSlot } from "../../domain/registry.js";
import type { DefDeclNode } from "../../domain/syntax-tree.js";

interface TagIrOverride {
  readonly path: string;
  readonly merge: IrMerge;
}

/** Canonical IR routing for kernel and test fixture tags — derived at compile from export def name + placement. */
const TAG_IR_OVERRIDES: Readonly<Record<string, TagIrOverride>> = {
  stack: { path: "stack", merge: IrMerge.MergeFields },
  topology: { path: "topology", merge: IrMerge.MergeFields },
  tenancy: { path: "tenancy", merge: IrMerge.MergeFields },
  guide: { path: "guide[]", merge: IrMerge.AppendHost },
  actor: { path: "actors[]", merge: IrMerge.AppendHost },
  rule: { path: "rules[]", merge: IrMerge.AppendHost },
  deploy: { path: "deployments[]", merge: IrMerge.AppendHost },
  environment: { path: "environments[]", merge: IrMerge.AppendHost },
  gate: { path: "gates[]", merge: IrMerge.AppendHost },
  security: { path: "security[]", merge: IrMerge.MergeFields },
  integration: { path: "integrations[]", merge: IrMerge.AppendHost },
  event: { path: "events[]", merge: IrMerge.AppendHost },
  enum: { path: "enums[]", merge: IrMerge.AppendHost },
  entity: { path: "entities[]", merge: IrMerge.AppendHost },
  pk: { path: "fields[]", merge: IrMerge.FieldAnnotation },
  nullable: { path: "fields[]", merge: IrMerge.FieldAnnotation },
  auth: { path: "auth", merge: IrMerge.MergeIntoHost },
  output: { path: "response", merge: IrMerge.MergeIntoHost },
  api: { path: "endpoints[]", merge: IrMerge.AppendHost },
  surface: { path: "surfaces[]", merge: IrMerge.MergeFields },
  test: { path: "scenarios[]", merge: IrMerge.AppendHost },
};

function defaultPathForPlacement(placement: PlacementTarget, modifier: boolean): string {
  if (placement === PlacementTarget.Field) return "fields[]";
  if (modifier) return "modifiers[]";
  return "extensions[]";
}

function defaultMergeForDef(def: DefDeclNode): IrMerge {
  if (def.modifier) return IrMerge.MergeIntoHost;
  if (def.inTargets.includes(PlacementTarget.Field)) return IrMerge.FieldAnnotation;
  return IrMerge.MergeFields;
}

/** Derive IR slot metadata from export def name, placement, and modifier flag. */
export function deriveIrSlotForTag(def: DefDeclNode): IrSlot {
  const primaryIn = def.inTargets[0] ?? PlacementTarget.Service;
  const file = irFileForPlacement(primaryIn) ?? IrFile.Service;
  const override = TAG_IR_OVERRIDES[def.name];
  if (override) {
    return { file, path: override.path, merge: override.merge };
  }
  return {
    file,
    path: defaultPathForPlacement(primaryIn, def.modifier),
    merge: defaultMergeForDef(def),
  };
}
