import { z } from "zod";
import {
  actorSchema,
  configProfileSchema,
  errorsCatalogSchema,
  eventSchema,
  guidanceSchema,
  integrationSchema,
  observeSchema,
  ruleSchema,
} from "./ir-common.js";

export const moduleDocumentSchema = z.object({
  name: z.string().min(1),
  description: z.union([z.string(), guidanceSchema]).optional(),
  actors: z.array(actorSchema).default([]),
  rules: z.array(ruleSchema).default([]),
  config: z
    .object({
      profiles: z.record(configProfileSchema).default({}),
    })
    .optional(),
  errors: z
    .object({
      catalog: errorsCatalogSchema.default({}),
    })
    .optional(),
  integrations: z.array(integrationSchema).default([]),
  events: z.array(eventSchema).default([]),
  eventHandlers: z.array(eventSchema).default([]),
  observe: observeSchema.optional(),
  dependsOn: z.array(z.string()).default([]),
  guide: guidanceSchema.optional(),
});

export const moduleSliceSchema = z.object({
  module: moduleDocumentSchema,
});

export type ModuleDocument = z.infer<typeof moduleDocumentSchema>;
