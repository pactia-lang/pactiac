import assert from "node:assert/strict";
import { test } from "node:test";
import {
  manifestSchema,
  modelSliceSchema,
  moduleSliceSchema,
  productSchema,
  serviceSliceSchema,
} from "./index.js";

test("manifestSchema requires module index entries", () => {
  const parsed = manifestSchema.parse({
    manifest: {
      pactiaVersion: "1.0",
      compiledAt: "1970-01-01T00:00:00.000Z",
      entry: "product.pactia",
      modules: [
        {
          name: "fleet",
          path: "modules/fleet/",
          module: "fleet.module.yaml",
          model: "fleet.model.yaml",
          services: [{ name: "fleet", file: "services/fleet.service.yaml" }],
        },
      ],
    },
  });
  assert.equal(parsed.manifest.modules[0]?.name, "fleet");
});

test("productSchema accepts surface bind endpoint references", () => {
  productSchema.parse({
    product: {
      name: "Demo",
      stackId: "@pactia/rust-anb",
      surfaces: [
        {
          id: "home",
          bind: { service: "FleetService", endpoint: "list_vehicles" },
        },
      ],
    },
  });
});

test("moduleSliceSchema accepts actors rules and config profiles", () => {
  moduleSliceSchema.parse({
    module: {
      name: "fleet",
      actors: [{ id: "admin", role: "Admin", capabilities: [] }],
      rules: [{ id: "r1", text: "rule text" }],
      config: { profiles: { backend: { DATABASE_URL: { required: true } } } },
    },
  });
});

test("modelSliceSchema accepts entities and enums", () => {
  modelSliceSchema.parse({
    model: {
      name: "fleet",
      entities: [
        {
          name: "Vehicle",
          fields: [{ name: "id", type: "UUID", annotations: { primary: true } }],
        },
      ],
      enums: [{ name: "VehicleStatus", values: ["ACTIVE"] }],
    },
  });
});

test("serviceSliceSchema accepts flags endpoints and scenarios", () => {
  serviceSliceSchema.parse({
    service: {
      name: "FleetService",
      flags: { database: true, cache: true, events: true },
      endpoints: [
        {
          id: "list_vehicles",
          method: "GET",
          path: "/api/v1/vehicles",
          authorization: { type: "ROLE", roles: ["Admin"] },
        },
      ],
      scenarios: [
        {
          name: "lists",
          service: "FleetService",
          given: {},
          when: { method: "GET", path: "/api/v1/vehicles" },
          then: { httpStatus: "200" },
        },
      ],
    },
  });
});
