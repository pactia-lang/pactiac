import assert from "node:assert/strict";
import { test } from "node:test";
import { extractKernel } from "../frontend/kernel/extract.js";
import { InferenceErrorCode, applyInference, inferOwnershipField, inferResourceEntityName } from "./infer.js";
import { lowerIrWorkspace, buildIrWorkspace } from "./ir.js";

const FLEET_MODULE = `
pactia 1.0
product FleetManagement {
  @stack rust-anb { }
  module fleet {
    model {
      @enum VehicleStatus { values: [ACTIVE, INACTIVE], }
      @entity Customer { @pk id: uuid, name: string, }
      @entity Vehicle {
        @pk id: uuid,
        @fk { entity: Customer }
        customerId: uuid,
        label: string,
        status: VehicleStatus,
      }
      @entity GpsIngestRequest { deviceId: string, latitude: decimal, }
      @entity GpsIngestResponse { positionId: uuid, }
    }
    service FleetService {
      @auth { roles: [Customer] }
      #[owner]
      @api list_vehicles { method: GET, path: "/api/v1/vehicles", }
      @public
      @input GpsIngestRequest
      @output GpsIngestResponse
      @api gps_ingest { method: POST, path: "/api/v1/gps/ingest", }
    }
    @integration gps_devices {
      direction: inbound,
      auth: { type: api_key, env: GPS_DEVICE_API_KEY },
      maps_to: "POST /api/v1/gps/ingest",
    }
  }
}
`;

test("applyInference fills integration wire bodies from maps_to endpoint", () => {
  const program = extractKernel(FLEET_MODULE);
  const workspace = buildIrWorkspace(program);
  const { diagnostics } = applyInference(program, workspace);
  assert.deepEqual(diagnostics, []);

  const integrations = (
    (workspace["modules"] as Record<string, unknown>[])[0]!["module"] as Record<string, unknown>
  )["module"] as Record<string, unknown>;
  const integration = (integrations["integrations"] as Record<string, unknown>[])[0]!;
  assert.equal(integration["requestBody"], "GpsIngestRequest");
  assert.equal(integration["responseBody"], "GpsIngestResponse");
});

test("applyInference infers ownership.field from OWN_ROWS authorization IR", () => {
  const program = extractKernel(FLEET_MODULE);
  const workspace = buildIrWorkspace(program);
  applyInference(program, workspace);

  const endpoints = (
    ((workspace["modules"] as Record<string, unknown>[])[0]!["services"] as Record<string, unknown>[])[0]![
      "service"
    ] as Record<string, unknown>
  )["endpoints"] as Record<string, unknown>[];
  const list = endpoints.find((endpoint) => endpoint["id"] === "list_vehicles");
  const ownership = (list!["authorization"] as Record<string, unknown>)["ownership"] as Record<
    string,
    unknown
  >;
  assert.equal(ownership["field"], "customerId");
});

test("applyInference keys off modifiers.detail from package-style macro expansion", () => {
  const source = `
pactia 1.0
product Demo {
  @stack rust-anb { }
  module fleet {
    model {
      @entity Vehicle { @pk id: uuid, label: string, }
    }
    service FleetService {
      @auth { roles: [Admin] }
      @api get_vehicle { method: GET, path: "/api/v1/vehicles/:id", }
    }
  }
}
`;
  const program = extractKernel(source);
  const workspace = buildIrWorkspace(program);
  const endpoints = (
    (workspace["modules"] as Record<string, unknown>[])[0]!["services"] as Record<string, unknown>[]
  )[0]!["service"] as Record<string, unknown>;
  const endpointIr = (endpoints["endpoints"] as Record<string, unknown>[]).find(
    (entry) => entry["id"] === "get_vehicle",
  )!;
  endpointIr["modifiers"] = { detail: true };
  applyInference(program, workspace);

  const response = endpointIr["response"] as Record<string, unknown>;
  assert.equal(response["bodyRef"], "Vehicle");
  assert.equal(response["provenance"], "INFERRED");
});

test("applyInference derives create request/response when tags omitted", () => {
  const source = `
pactia 1.0
product Demo {
  @stack rust-anb { }
  module fleet {
    model {
      @entity Vehicle {
        @pk id: uuid,
        @fk { entity: Customer }
        customerId: uuid,
        vin: string,
        label: string,
      }
      @entity Customer { @pk id: uuid, }
    }
    service FleetService {
      @auth { roles: [Admin] }
      #[create]
      @api create_vehicle { method: POST, path: "/api/v1/vehicles", }
    }
  }
}
`;
  const program = extractKernel(source);
  const workspace = buildIrWorkspace(program);
  applyInference(program, workspace);

  const bundle = (workspace["modules"] as Record<string, unknown>[])[0]!;
  const endpoint = (
    (bundle["services"] as Record<string, unknown>[])[0]!["service"] as Record<string, unknown>
  )["endpoints"] as Record<string, unknown>[];
  const create = endpoint.find((entry) => entry["id"] === "create_vehicle")!;
  assert.equal((create["request"] as Record<string, unknown>)["bodyRef"], "CreateVehicleRequest");
  assert.equal((create["response"] as Record<string, unknown>)["bodyRef"], "CreateVehicleResponse");
  assert.equal((create["response"] as Record<string, unknown>)["status"], 201);

  const entities = (bundle["model"] as Record<string, unknown>)["model"] as Record<string, unknown>;
  const names = (entities["entities"] as Record<string, unknown>[]).map((entity) => entity["name"]);
  assert.ok(names.includes("CreateVehicleRequest"));
  assert.ok(names.includes("CreateVehicleResponse"));
});

test("inferResourceEntityName maps list_vehicles to Vehicle", () => {
  const program = extractKernel(FLEET_MODULE);
  const module = program.modules[0]!;
  const endpoint = module.services[0]!.endpoints[0]!;
  assert.equal(inferResourceEntityName(module, endpoint), "Vehicle");
});

test("inferOwnershipField resolves customerId from Customer role", () => {
  const program = extractKernel(FLEET_MODULE);
  const module = program.modules[0]!;
  const endpoint = module.services[0]!.endpoints[0]!;
  assert.equal(inferOwnershipField(module, endpoint, "Vehicle"), "customerId");
});

test("applyInference reports unresolved maps_to", () => {
  const source = `
pactia 1.0
product Demo { @stack rust-anb { }
  module fleet {
    @integration broken { direction: inbound, maps_to: "POST /missing", }
  }
}
`;
  const program = extractKernel(source);
  const workspace = buildIrWorkspace(program);
  const { diagnostics } = applyInference(program, workspace);
  assert.ok(
    diagnostics.some((diagnostic) =>
      diagnostic.message.includes(InferenceErrorCode.MapsToUnresolved),
    ),
  );
});
