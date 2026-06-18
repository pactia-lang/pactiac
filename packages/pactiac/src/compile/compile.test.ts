import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "./compile.js";

test("compile rejects unsupported pactia versions", () => {
  assert.throws(
    () => compile("pactia 2.0\nproduct X { module m { service S { } } }"),
    /Unsupported pactia version/,
  );
});

test("compile accepts pactia 1.0 patch versions", () => {
  const result = compile(`pactia 1.0.1\nproduct X {
    module m {
      #[database]
      service S { }
    }
  }`);
  assert.ok(result.files.size > 0);
});
