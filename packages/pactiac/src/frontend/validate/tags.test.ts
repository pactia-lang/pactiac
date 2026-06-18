import assert from "node:assert/strict";
import { test } from "node:test";
import { extractKernel } from "../kernel/extract.js";
import { validateKernelTags } from "./tags.js";

test("validateKernelTags passes fleet fixture", () => {
  const program = extractKernel(`pactia 1.0
import @pactia/protocol-rest;
product Fleet { @stack rust-anb { }
  module fleet { service FleetService {
    @auth { roles: [Admin] }
    @api list_x { method: GET, path: "/x", }
  } }
}`);
  assert.equal(validateKernelTags(program).length, 0);
});

test("validateKernelTags reports missing api method and path", () => {
  const program = extractKernel(`pactia 1.0
product X { @stack rust-anb { }
  module m { service S {
    @api broken { }
  } }
}`);
  const diagnostics = validateKernelTags(program);
  assert.ok(diagnostics.some((d) => d.target.endsWith(".method")));
  assert.ok(diagnostics.some((d) => d.target.endsWith(".path")));
});
