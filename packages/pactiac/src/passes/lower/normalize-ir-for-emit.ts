import { z } from "zod";
import {
  manifestSchema,
  modelSliceSchema,
  moduleSliceSchema,
  productSchema,
  serviceSliceSchema,
} from "@pactia/schema";

/** Apply Zod `.default()` values only — no shape validation (lowering may lag schema). */
export function applyZodDefaults<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  if (schema instanceof z.ZodDefault) {
    if (value === undefined) {
      return schema._def.defaultValue() as z.infer<T>;
    }
    return applyZodDefaults(schema._def.innerType as z.ZodTypeAny, value) as z.infer<T>;
  }

  if (schema instanceof z.ZodOptional) {
    if (value === undefined) {
      return undefined as z.infer<T>;
    }
    return applyZodDefaults(schema._def.innerType as z.ZodTypeAny, value) as z.infer<T>;
  }

  if (schema instanceof z.ZodObject) {
    const input =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const result: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(schema.shape)) {
      result[key] = applyZodDefaults(fieldSchema as z.ZodTypeAny, input[key]);
    }
    return result as z.infer<T>;
  }

  return value as z.infer<T>;
}

/** Fill IR slice defaults at emit time — schema contract, not tag lowering. */
export function normalizeIrFileForEmit(relativePath: string, value: unknown): unknown {
  if (relativePath.endsWith("manifest.json")) {
    return applyZodDefaults(manifestSchema, value);
  }
  if (relativePath.endsWith("product.json")) {
    return applyZodDefaults(productSchema, value);
  }
  if (relativePath.includes("/services/") && relativePath.endsWith(".service.json")) {
    return applyZodDefaults(serviceSliceSchema, value);
  }
  if (relativePath.endsWith(".model.json")) {
    return applyZodDefaults(modelSliceSchema, value);
  }
  if (relativePath.endsWith(".module.json")) {
    return applyZodDefaults(moduleSliceSchema, value);
  }
  return value;
}
