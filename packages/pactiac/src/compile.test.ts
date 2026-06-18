import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "./compile.js";
import { parse } from "./parser.js";

const moduleSource = `
pactia 1.0

product FleetModuleTest {
  stack rust-anb ^1.0
  topology microservices
  tenancy single
}

module fleet {
  actor Admin { manage fleets, manage users }
  actor Customer { track vehicles, view history }

  rule "Vehicles belong to customers"

  model fleet {
    enum VehicleStatus { ACTIVE, INACTIVE, DECOMMISSIONED }

    entity Customer {
      id: uuid,
      name: string,
      email: string[pii, unique]
    }

    entity Vehicle {
      id: uuid,
      customerId: uuid,
      vin: string[unique],
      label: string,
      status: VehicleStatus
    }

    Customer owns many Vehicle
  }

  service FleetService "Core fleet management" {
    database true
    cache true
    events true

    GET /api/v1/vehicles for Customer, Admin [list, as owner]
    POST /api/v1/vehicles for Admin [create]
  }
}
`.trim();

test("parses a module block with model (not legacy domain keyword)", () => {
  const program = parse(moduleSource);
  assert.equal(program.product.name, "FleetModuleTest");
  assert.equal(program.modules.length, 1);

  const mod = program.modules[0]!;
  assert.equal(mod.name, "fleet");
  assert.equal(mod.actors.length, 2);
  assert.ok(mod.model, "module should have a model block");
  assert.equal(mod.model?.entities.length, 2);
  assert.equal(mod.model?.enums.length, 1);
  assert.equal(mod.services.length, 1);
});

test("rejects flat top-level declarations outside module", () => {
  const flatSource = `
pactia 1.0
product X { stack rust-anb ^1.0 topology microservices tenancy single }
actor Admin { manage }
`.trim();

  assert.throws(() => parse(flatSource), /must live inside module/);
});

test("rejects legacy domain keyword inside module", () => {
  const legacySource = `
pactia 1.0
product X { stack rust-anb ^1.0 topology microservices tenancy single }
module m {
  domain d { entity Item { id: uuid } }
}
`.trim();

  assert.throws(() => parse(legacySource), /Unknown declaration 'domain'/);
});

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
