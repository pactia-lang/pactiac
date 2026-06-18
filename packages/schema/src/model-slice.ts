import { z } from "zod";
import {
  entitySchema,
  enumSchema,
  relationSchema,
  ruleSchema,
  stateMachineSchema,
} from "./ir-common.js";

export const modelDocumentSchema = z.object({
  name: z.string().min(1).optional(),
  entities: z.array(entitySchema).default([]),
  enums: z.array(enumSchema).default([]),
  relations: z.array(relationSchema).default([]),
  stateMachines: z.array(stateMachineSchema).default([]),
  rules: z.array(ruleSchema).default([]),
});

export const modelSliceSchema = z.object({
  model: modelDocumentSchema,
});

export type ModelDocument = z.infer<typeof modelDocumentSchema>;
