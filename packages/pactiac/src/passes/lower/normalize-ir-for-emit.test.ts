import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modelSliceSchema } from "@pactia/schema";
import { applyZodDefaults, normalizeIrFileForEmit } from "./normalize-ir-for-emit.js";

describe("normalizeIrForEmit", () => {
  it("fills schema default arrays for sparse model slices at emit time", () => {
    const filled = applyZodDefaults(modelSliceSchema, {
      model: { name: "orders" },
    });
    assert.deepEqual(filled.model.entities, []);
    assert.deepEqual(filled.model.enums, []);
    assert.deepEqual(filled.model.relations, []);
  });

  it("preserves registry-written slots when normalizing for emit", () => {
    const filled = applyZodDefaults(modelSliceSchema, {
      model: {
        name: "orders",
        entities: [{ name: "Order", fields: [{ name: "id", type: "UUID" }] }],
      },
    }) as { model: { entities: unknown[]; enums: unknown[] } };
    assert.equal(filled.model.entities.length, 1);
    assert.deepEqual(filled.model.enums, []);
  });

  it("routes model paths through model slice defaults", () => {
    const normalized = normalizeIrFileForEmit("input/modules/orders/orders.model.json", {
      model: { name: "orders" },
    }) as { model: { stateMachines: unknown[] } };
    assert.deepEqual(normalized.model.stateMachines, []);
  });
});
