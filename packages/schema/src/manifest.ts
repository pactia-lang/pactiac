import { z } from "zod";

export const manifestModuleServiceSchema = z.object({
  name: z.string().min(1),
  file: z.string().min(1),
});

export const manifestModuleEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  module: z.string().min(1),
  model: z.string().min(1),
  services: z.array(manifestModuleServiceSchema).default([]),
});

export const manifestReferenceEndpointSchema = z.object({
  module: z.string().min(1),
  entity: z.string().min(1),
  field: z.string().min(1),
});

export const manifestReferenceSchema = z.object({
  from: manifestReferenceEndpointSchema,
  to: z.object({
    module: z.string().min(1),
    entity: z.string().min(1),
    field: z.string().optional(),
  }),
});

export const manifestDocumentSchema = z.object({
  pactiaVersion: z.string().min(1),
  compiledAt: z.string().min(1),
  entry: z.string().min(1),
  lockfileDigest: z.string().optional(),
  modules: z.array(manifestModuleEntrySchema).default([]),
  references: z.array(manifestReferenceSchema).default([]),
});

export const manifestSchema = z.object({
  manifest: manifestDocumentSchema,
});

export type ManifestDocument = z.infer<typeof manifestDocumentSchema>;
export type ManifestModuleEntry = z.infer<typeof manifestModuleEntrySchema>;
