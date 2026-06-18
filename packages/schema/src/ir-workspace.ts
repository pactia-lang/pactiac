import { z } from "zod";
import { manifestSchema } from "./manifest.js";
import { modelSliceSchema } from "./model-slice.js";
import { moduleSliceSchema } from "./module-slice.js";
import { productSchema } from "./product.js";
import { serviceSliceSchema } from "./service-slice.js";

export const irModuleBundleSchema = z.object({
  module: moduleSliceSchema,
  model: modelSliceSchema,
  services: z.array(serviceSliceSchema).default([]),
});

export const irWorkspaceSchema = z.object({
  manifest: manifestSchema,
  product: productSchema,
  modules: z.array(irModuleBundleSchema).min(1),
});

export type IrModuleBundle = z.infer<typeof irModuleBundleSchema>;
export type IrWorkspace = z.infer<typeof irWorkspaceSchema>;

export {
  manifestSchema,
  productSchema,
  moduleSliceSchema,
  modelSliceSchema,
  serviceSliceSchema,
};
