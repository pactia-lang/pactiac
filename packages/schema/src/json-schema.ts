import { zodToJsonSchema } from "zod-to-json-schema";
import { manifestSchema } from "./manifest.js";
import { modelSliceSchema } from "./model-slice.js";
import { moduleSliceSchema } from "./module-slice.js";
import { productSchema } from "./product.js";
import { irWorkspaceSchema } from "./ir-workspace.js";
import { serviceSliceSchema } from "./service-slice.js";

function exportNamedSchema(schema: Parameters<typeof zodToJsonSchema>[0], name: string): Record<string, unknown> {
  return zodToJsonSchema(schema, {
    name,
    $refStrategy: "none",
  }) as Record<string, unknown>;
}

export function exportManifestJsonSchema(): Record<string, unknown> {
  return exportNamedSchema(manifestSchema, "Manifest");
}

export function exportProductJsonSchema(): Record<string, unknown> {
  return exportNamedSchema(productSchema, "Product");
}

export function exportModuleSliceJsonSchema(): Record<string, unknown> {
  return exportNamedSchema(moduleSliceSchema, "ModuleSlice");
}

export function exportModelSliceJsonSchema(): Record<string, unknown> {
  return exportNamedSchema(modelSliceSchema, "ModelSlice");
}

export function exportServiceSliceJsonSchema(): Record<string, unknown> {
  return exportNamedSchema(serviceSliceSchema, "ServiceSlice");
}

export function exportIrWorkspaceJsonSchema(): Record<string, unknown> {
  return exportNamedSchema(irWorkspaceSchema, "IrWorkspace");
}

export const irJsonSchemaExporters = {
  manifest: exportManifestJsonSchema,
  product: exportProductJsonSchema,
  module: exportModuleSliceJsonSchema,
  model: exportModelSliceJsonSchema,
  service: exportServiceSliceJsonSchema,
  workspace: exportIrWorkspaceJsonSchema,
} as const;

export type IrJsonSchemaName = keyof typeof irJsonSchemaExporters;
