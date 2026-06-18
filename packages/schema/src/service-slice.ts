import { z } from "zod";
import { httpMethodValues } from "./enums.js";
import { endpointSchema, guidanceSchema } from "./ir-common.js";
import { ScenarioOwnership, ScenarioProvenance } from "./provenance.js";

export const scenarioGivenSchema = z.object({
  actor: z.string().min(1).optional(),
  auth: z.string().min(1).optional(),
  ownership: z.enum([ScenarioOwnership.Owner, ScenarioOwnership.NonOwner]).optional(),
});

export const scenarioWhenSchema = z.object({
  method: z.enum(httpMethodValues as [string, ...string[]]),
  path: z.string().min(1),
  body: z.record(z.unknown()).optional(),
});

export const scenarioThenSchema = z.object({
  httpStatus: z.string().optional(),
  bodyRef: z.string().optional(),
  kafkaEmits: z.string().optional(),
  text: z.string().optional(),
});

export const scenarioEntrySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  service: z.string().min(1).optional(),
  provenance: z.literal(ScenarioProvenance.Pactia).default(ScenarioProvenance.Pactia),
  given: scenarioGivenSchema.default({}),
  when: scenarioWhenSchema.optional(),
  then: scenarioThenSchema.optional(),
  text: z.union([z.string(), z.object({ when: z.string(), then: z.string() })]).optional(),
});

export const loweredScenarioEntrySchema = scenarioEntrySchema.extend({
  service: z.string().min(1),
  when: scenarioWhenSchema,
  then: scenarioThenSchema,
});

export const obligationSchema = z.object({
  id: z.string().min(1).optional(),
  on: z.string().optional(),
  trigger: z.string().optional(),
  outcome: z.string().optional(),
  text: z.union([z.string(), z.array(z.string())]).optional(),
});

export const serviceFlagsSchema = z.object({
  database: z.boolean().default(false),
  cache: z.boolean().default(false),
  events: z.boolean().default(false),
});

export const serviceDocumentSchema = z.object({
  name: z.string().min(1),
  description: z.union([z.string(), guidanceSchema]).optional(),
  flags: serviceFlagsSchema.optional(),
  database: z.boolean().optional(),
  cache: z.boolean().optional(),
  events: z.boolean().optional(),
  guide: guidanceSchema.optional(),
  endpoints: z.array(endpointSchema).default([]),
  scenarios: z.array(scenarioEntrySchema).default([]),
  obligations: z.array(obligationSchema).default([]),
});

export const serviceSliceSchema = z.object({
  service: serviceDocumentSchema,
});

export const scenariosInputSchema = z.object({
  scenarios: z.array(loweredScenarioEntrySchema),
});

export type ScenarioGiven = z.infer<typeof scenarioGivenSchema>;
export type ScenarioWhen = z.infer<typeof scenarioWhenSchema>;
export type ScenarioThenInput = z.infer<typeof scenarioThenSchema>;
export type ScenarioEntry = z.infer<typeof scenarioEntrySchema>;
export type ScenariosInput = z.infer<typeof scenariosInputSchema>;
export type ServiceDocument = z.infer<typeof serviceDocumentSchema>;
export type Obligation = z.infer<typeof obligationSchema>;
