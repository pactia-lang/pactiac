import { z } from "zod";
import { guidanceSchema } from "./ir-common.js";

export const productTopologySchema = z.object({
  mode: z.string().min(1),
});

export const productTenancySchema = z.object({
  mode: z.string().min(1),
});

export const productSurfaceBindSchema = z.object({
  service: z.string().optional(),
  endpoint: z.string().optional(),
  method: z.string().optional(),
  path: z.string().optional(),
  data: z.string().optional(),
});

export const productSurfaceScreenSchema = z.object({
  id: z.string().min(1),
  route: z.object({ path: z.string().min(1) }).optional(),
  nav: z.record(z.unknown()).optional(),
  description: z.union([z.string(), guidanceSchema]).optional(),
});

export const productSurfaceEntrySchema = z.object({
  id: z.string().min(1),
  platform: z.enum(["web", "ios", "android", "desktop"]).optional(),
  screen: productSurfaceScreenSchema.optional(),
  bind: productSurfaceBindSchema.optional(),
  description: z.union([z.string(), guidanceSchema]).optional(),
});

export const productDeploymentEnvironmentSchema = z.object({
  id: z.string().min(1),
  replicas: z.number().int().nonnegative().optional(),
  region: z.string().optional(),
});

export const productDeploymentGateSchema = z.object({
  id: z.string().min(1),
  scenarios: z.string().optional(),
  coverage: z.string().optional(),
});

export const productDeploymentSchema = z.object({
  id: z.string().min(1).optional(),
  environments: z.array(productDeploymentEnvironmentSchema).default([]),
  gates: z.array(productDeploymentGateSchema).default([]),
});

export const productDocumentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.union([z.string(), guidanceSchema]).optional(),
  stackId: z.string().min(1),
  stackVersion: z.string().optional(),
  stackDigest: z.string().optional(),
  topology: productTopologySchema.optional(),
  tenancy: productTenancySchema.optional(),
  guide: guidanceSchema.optional(),
  surfaces: z.array(productSurfaceEntrySchema).default([]),
  security: z.record(z.unknown()).optional(),
  deployment: productDeploymentSchema.optional(),
});

export const productSchema = z.object({
  product: productDocumentSchema,
});

export type ProductDocument = z.infer<typeof productDocumentSchema>;
