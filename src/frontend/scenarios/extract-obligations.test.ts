import assert from "node:assert/strict";
import { test } from "node:test";
import { extractMustObligations } from "./extract-obligations.js";

test("extractMustObligations parses on trigger with prose outcomes", () => {
  const source = `product X { module m { service S {
    @must payment_failed_release {
      on: payment_failed,
      > inventory reservation is released
      > order status becomes cancelled
    }
  } } }`;
  const obligations = extractMustObligations(source);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0]?.id, "payment_failed_release");
  assert.equal(obligations[0]?.on, "payment_failed");
  assert.equal(obligations[0]?.lines?.length, 2);
});

test("extractMustObligations requires service scope", () => {
  assert.throws(
    () =>
      extractMustObligations(`product X { module m {
        @must orphan { on: x, > outcome }
      } }`),
    /@must must appear inside a service block/,
  );
});
