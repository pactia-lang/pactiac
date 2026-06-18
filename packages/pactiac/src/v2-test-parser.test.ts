import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPactiaVersion, extractV2Tests } from "./v2-test-parser.js";

const serviceScopedSource = `
pactia 1.0
product X { module m { service S {
  @test t {
    name: "one",
    when: "Admin is logged in and POST /x",
    then: "status is 201",
  }
} } }
`.trim();

test("detectPactiaVersion reads pactia header", () => {
  assert.equal(detectPactiaVersion("pactia 1.0\nproduct X {}"), "1.0");
  assert.equal(detectPactiaVersion("pactia 1.1\nproduct X {}"), "1.1");
});

test("extractV2Tests attributes scenarios to enclosing service", () => {
  const scenarios = extractV2Tests(serviceScopedSource);
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0]?.service, "S");
  assert.equal(scenarios[0]?.name, "one");
});

test("extractV2Tests rejects @test outside service", () => {
  const source = `pactia 1.0\nproduct X { @test t { name: "x", when: "GET /x", then: "status is 200", } }`;
  assert.throws(() => extractV2Tests(source), /@test must appear inside a service block/);
});

test("extractV2Tests rejects missing when/then fields", () => {
  const source = `pactia 1.0\nproduct X { module m { service S { @test t { name: "x", } } } }`;
  assert.throws(() => extractV2Tests(source), /Expected when: and then:/);
});
