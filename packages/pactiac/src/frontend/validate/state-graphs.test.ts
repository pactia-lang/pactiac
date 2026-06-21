import assert from "node:assert/strict";
import { test } from "node:test";
import { readTestFixture, TestFixtureId } from "../../../../../test/fixture-paths.js";
import { extractKernel } from "../kernel/extract.js";
import { StateGraphErrorCode, validateStateGraphs } from "./state-graphs.js";

function messages(source: string): string[] {
  const program = extractKernel(source);
  return validateStateGraphs(program).map((diagnostic) => diagnostic.message);
}

const VALID_MODEL = `
pactia 1.0
product Demo {
  @stack rust-anb { }
  module fleet {
    model {
      @enum VehicleStatus { values: [ACTIVE, INACTIVE, DECOMMISSIONED], }
      @entity Vehicle { status: VehicleStatus, }
      @states vehicle_lifecycle {
        entity: Vehicle.status,
        transitions: [
          { from: ACTIVE, to: INACTIVE },
          { from: INACTIVE, to: DECOMMISSIONED },
        ],
      }
    }
    service FleetService {
      @auth { roles: [Admin] }
      @api deactivate {
        method: POST,
        path: "/vehicles/:id/deactivate",
        @transition { from: ACTIVE, to: INACTIVE },
      }
    }
  }
}
`;

test("validateStateGraphs accepts valid @states and @transition", () => {
  assert.deepEqual(messages(VALID_MODEL), []);
});

test("validateStateGraphs rejects unknown enum member in transition", () => {
  const source = VALID_MODEL.replace(
    "{ from: ACTIVE, to: INACTIVE }",
    "{ from: ACTIVE, to: MISSING }",
  );
  assert.ok(
    messages(source).some((message) => message.includes(StateGraphErrorCode.BindingInvalid)),
  );
});

test("validateStateGraphs rejects duplicate edge in @states", () => {
  const source = VALID_MODEL.replace(
    "transitions: [",
    "transitions: [{ from: ACTIVE, to: INACTIVE }, { from: ACTIVE, to: INACTIVE },",
  );
  assert.ok(
    messages(source).some((message) => message.includes(StateGraphErrorCode.DuplicateTransition)),
  );
});

test("validateStateGraphs rejects duplicate entity.field binding", () => {
  const source = VALID_MODEL.replace(
    "@states vehicle_lifecycle {",
    `@states other_lifecycle {
        entity: Vehicle.status,
        transitions: [{ from: ACTIVE, to: DECOMMISSIONED }],
      }
      @states vehicle_lifecycle {`,
  );
  assert.ok(
    messages(source).some((message) => message.includes(StateGraphErrorCode.MachineDuplicate)),
  );
});

test("validateStateGraphs rejects @transition edge not in @states graph", () => {
  const source = VALID_MODEL.replace(
    "@transition { from: ACTIVE, to: INACTIVE }",
    "@transition { from: DECOMMISSIONED, to: ACTIVE }",
  );
  assert.ok(
    messages(source).some((message) => message.includes(StateGraphErrorCode.TransitionUndefined)),
  );
});

test("validateStateGraphs rejects invalid entity.field binding", () => {
  const source = VALID_MODEL.replace("entity: Vehicle.status", "entity: Missing.status");
  assert.ok(
    messages(source).some((message) => message.includes(StateGraphErrorCode.BindingInvalid)),
  );
});

test("validateStateGraphs rejects non-enum field binding", () => {
  const source = VALID_MODEL.replace(
    "@entity Vehicle { status: VehicleStatus, }",
    "@entity Vehicle { status: string, }",
  );
  assert.ok(
    messages(source).some((message) => message.includes(StateGraphErrorCode.BindingInvalid)),
  );
});

test("extractKernel parses @transition from endpoint prefix modifiers", () => {
  const program = extractKernel(`
pactia 1.0
product Demo {
  @stack rust-anb { }
  module fleet {
    model {
      @enum S { values: [A, B], }
      @entity E { status: S, }
      @states s { entity: E.status, transitions: [{ from: A, to: B }], }
    }
    service Svc {
      @auth { roles: [Admin] }
      @transition { from: A, to: B }
      @api act { method: POST, path: "/act", }
    }
  }
}
`);
  const endpoint = program.modules[0]!.services[0]!.endpoints[0]!;
  assert.deepEqual(endpoint.transition, { from: "A", to: "B" });
  assert.deepEqual(validateStateGraphs(program), []);
});

test("relay fixture state graph validates cleanly", () => {
  const source = readTestFixture(TestFixtureId.Relay);
  assert.deepEqual(validateStateGraphs(extractKernel(source)), []);
});
