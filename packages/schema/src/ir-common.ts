import { z } from "zod";
import { httpMethodValues, integrationAuthTypeValues, integrationDirectionValues } from "./enums.js";
import { provenanceValues } from "./provenance.js";

export const provenanceFieldSchema = z.enum(provenanceValues as [string, ...string[]]);

export const guidanceSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.object({
    text: z.union([z.string(), z.array(z.string())]).optional(),
    provenance: provenanceFieldSchema.optional(),
  }),
]);

export const ruleSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  provenance: provenanceFieldSchema.optional(),
});

export const actorSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
});

export const errorDefinitionSchema = z.object({
  status: z.number().int(),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const errorsCatalogSchema = z.record(errorDefinitionSchema);

export const configEntrySchema = z.object({
  required: z.boolean().optional(),
  secret: z.boolean().optional(),
  default: z.string().optional(),
  description: z.union([z.string(), guidanceSchema]).optional(),
});

export const configProfileSchema = z.record(configEntrySchema);

export const integrationSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(integrationDirectionValues as [string, ...string[]]),
  auth: z
    .object({
      type: z.enum(integrationAuthTypeValues as [string, ...string[]]),
      env: z.string().optional(),
      header: z.string().optional(),
    })
    .optional(),
  mapsTo: z.string().optional(),
  purpose: z.union([z.string(), guidanceSchema]).optional(),
  timeout: z.string().optional(),
  retry: z.string().optional(),
  requestBody: z.string().optional(),
  responseBody: z.string().optional(),
});

export const eventSchema = z.object({
  id: z.string().min(1),
  payload: z.string().optional(),
  handler: z.string().optional(),
  description: z.union([z.string(), guidanceSchema]).optional(),
});

export const sloSchema = z.object({
  service: z.string().min(1),
  metric: z.string().min(1),
  target: z.string().min(1),
});

export const observeSchema = z.object({
  slos: z.array(sloSchema).default([]),
  alerts: z.array(z.record(z.unknown())).default([]),
});

export const entityFieldAnnotationSchema = z.object({
  primary: z.boolean().optional(),
  unique: z.boolean().optional(),
  nullable: z.boolean().optional(),
  pii: z.boolean().optional(),
  secret: z.boolean().optional(),
  references: z
    .union([
      z.string(),
      z.object({
        entity: z.string().min(1),
        field: z.string().optional(),
        module: z.string().optional(),
      }),
    ])
    .optional(),
  retention: z.record(z.unknown()).optional(),
  encryption: z.record(z.unknown()).optional(),
});

export const entityFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  array: z.boolean().default(false),
  optional: z.boolean().default(false),
  annotations: entityFieldAnnotationSchema.optional(),
  description: z.union([z.string(), guidanceSchema]).optional(),
});

export const entitySchema = z.object({
  name: z.string().min(1),
  fields: z.array(entityFieldSchema).min(1),
  description: z.union([z.string(), guidanceSchema]).optional(),
});

export const enumSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.string()).min(1),
  description: z.union([z.string(), guidanceSchema]).optional(),
});

export const relationSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  verb: z.string().optional(),
  cardinality: z.enum(["one", "many", "ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_MANY"]).optional(),
});

export const stateTransitionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const stateMachineSchema = z.object({
  id: z.string().min(1),
  entity: z.string().min(1),
  transitions: z.array(stateTransitionSchema).min(1),
});

export const authorizationSchema = z.object({
  type: z.enum(["PUBLIC", "ROLE", "OWNERSHIP", "CUSTOM", "public", "role", "ownership", "custom"]).optional(),
  roles: z.array(z.string()).default([]),
  ownership: z.record(z.unknown()).optional(),
});

export const endpointSchema = z.object({
  id: z.string().min(1),
  method: z.enum(httpMethodValues as [string, ...string[]]).optional(),
  path: z.string().optional(),
  summary: z.union([z.string(), guidanceSchema]).optional(),
  description: z.union([z.string(), guidanceSchema]).optional(),
  authorization: authorizationSchema.optional(),
  request: z.record(z.unknown()).optional(),
  response: z.record(z.unknown()).optional(),
  errors: z.array(z.string()).default([]),
  modifiers: z.record(z.unknown()).optional(),
  emits: z.array(z.string()).default([]),
  provenance: provenanceFieldSchema.optional(),
});
