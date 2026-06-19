import assert from "node:assert/strict";
import { test } from "node:test";
import { collectTagValidationInstances } from "./instances.js";
import { extractKernel } from "../kernel/extract.js";

test("collectTagValidationInstances maps api auth entity and stack", () => {
  const program = extractKernel(`pactia 1.0
product X { @stack rust-anb { }
  module m {
    model { @entity Item { id: UUID, } }
    service S {
      @auth { roles: [Admin] }
      @api list_items { method: GET, path: "/items", }
    }
  }
}`);
  const instances = collectTagValidationInstances(program);
  assert.ok(instances.some((i) => i.tag === "stack"));
  assert.ok(instances.some((i) => i.tag === "entity" && i.target === "entity.Item"));
  assert.ok(instances.some((i) => i.tag === "api" && i.body.method === "GET"));
  assert.ok(instances.some((i) => i.tag === "auth" && Array.isArray(i.body.roles)));
});

test("collectTagValidationInstances maps model tags and field modifiers", () => {
  const program = extractKernel(`pactia 1.0
product X { @stack rust-anb { }
  module m {
    model {
      @enum Status { values: [ACTIVE, INACTIVE], }
      @entity Customer {
        @pk
        id: uuid,
      }
      @relation owns { from: Customer, to: Item, verb: owns, cardinality: many, }
      @states lifecycle { entity: Item.status, transitions: [{ from: ACTIVE, to: INACTIVE }], }
    }
    service S {
      @auth { roles: [Admin] }
      @api x { method: GET, path: "/x", }
    }
  }
}`);
  const instances = collectTagValidationInstances(program);
  assert.ok(instances.some((i) => i.tag === "enum" && i.body.name === "Status"));
  assert.ok(instances.some((i) => i.tag === "pk" && i.target === "pk.Customer.id"));
  assert.ok(instances.some((i) => i.tag === "relation" && i.body.to === "Item"));
  assert.ok(instances.some((i) => i.tag === "states" && i.body.entity === "Item.status"));
});

test("collectTagValidationInstances maps product and service clause tags", () => {
  const program = extractKernel(`pactia 1.0
product X {
  @stack rust-anb { }
  @topology { mode: microservices, }
  @tenancy { mode: single, }
  @guide { > Use cursor pagination only. }
  module m {
    @security sec { > Audit all mutations. }
    service S {
      @guide service { > Map errors to envelope. }
      @auth { roles: [Admin] }
      @api x {
        method: GET,
        path: "/x",
        @surface list_web {
          platform: web,
          screen: { id: list },
          > Browse list
        },
      }
      @test list_ok {
        name: "List works",
        when: "GET /x",
        then: "status is 200",
      }
    }
  }
}`);
  const instances = collectTagValidationInstances(program);
  assert.ok(instances.some((i) => i.tag === "topology" && i.body.mode === "MICROSERVICES"));
  assert.ok(instances.some((i) => i.tag === "tenancy" && i.body.mode === "SINGLE_TENANT"));
  assert.ok(instances.some((i) => i.tag === "guide" && i.target === "product.guide"));
  assert.ok(instances.some((i) => i.tag === "security" && i.target === "security.sec"));
  assert.ok(instances.some((i) => i.tag === "surface" && i.body.platform === "web"));
  assert.ok(instances.some((i) => i.tag === "test" && i.target === "test.list_ok"));
});
