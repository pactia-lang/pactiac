import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { Provenance } from "../diagnostics/diagnostic.js";
import type {
  KernelEndpoint,
  KernelEntity,
  KernelModule,
  KernelProgram,
} from "../frontend/kernel/extract.js";

export enum InferenceErrorCode {
  MapsToUnresolved = "INFERENCE_MAPS_TO_UNRESOLVED",
  OwnerFieldAmbiguous = "INFERENCE_OWNER_FIELD_AMBIGUOUS",
  ResourceEntityUnknown = "INFERENCE_RESOURCE_ENTITY_UNKNOWN",
}

/** IR modifier keys that trigger inference after macro expansion (builtin or package). */
export enum IrModifierKey {
  Detail = "detail",
  List = "list",
  Create = "create",
}

export enum OwnershipScope {
  OwnRows = "OWN_ROWS",
}

export enum AuthorizationType {
  Ownership = "OWNERSHIP",
}

type WritableRecord = Record<string, unknown>;

export interface InferenceResult {
  readonly diagnostics: readonly Diagnostic[];
}

function modifierEnabled(endpointIr: WritableRecord, key: IrModifierKey): boolean {
  const modifiers = endpointIr["modifiers"] as WritableRecord | undefined;
  return modifiers?.[key] === true;
}

function ownershipNeedsFieldInference(endpointIr: WritableRecord): boolean {
  const authorization = endpointIr["authorization"] as WritableRecord | undefined;
  if (authorization?.["type"] !== AuthorizationType.Ownership) return false;
  const ownership = authorization["ownership"] as WritableRecord | undefined;
  return ownership?.["scope"] === OwnershipScope.OwnRows && !ownership["field"];
}

function normalizeWireKey(method: string, path: string): string {
  const normalizedPath = path.replace(/^"|"$/g, "").replace(/\/$/, "");
  return `${method.toUpperCase()} ${normalizedPath}`;
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && word.length > 1) return word.slice(0, -1);
  return word;
}

function endpointIdToResourceToken(endpointId: string): string | undefined {
  const stripped = endpointId.replace(/^(get|list|create|update|delete)_/, "");
  const parts = stripped.split("_").filter((part) => part.length > 0);
  if (parts.length === 0) return undefined;
  return singularize(parts[parts.length - 1]!);
}

function pathToResourceToken(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const segments = path
    .replace(/^"|"$/g, "")
    .split("/")
    .filter((segment) => segment.length > 0 && !segment.startsWith(":"));
  if (segments.length === 0) return undefined;
  return singularize(segments[segments.length - 1]!);
}

function entityNameFromToken(token: string | undefined): string | undefined {
  if (!token) return undefined;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function findEntity(module: KernelModule, name: string): KernelEntity | undefined {
  return module.entities.find((entity) => entity.name.toUpperCase() === name.toUpperCase());
}

function primaryEntities(module: KernelModule): KernelEntity[] {
  return module.entities.filter((entity) =>
    entity.fields.some((field) => field.annotations.primary),
  );
}

export function inferResourceEntityName(
  module: KernelModule,
  endpoint: KernelEndpoint,
): string | undefined {
  const candidates = [
    entityNameFromToken(endpointIdToResourceToken(endpoint.id)),
    entityNameFromToken(pathToResourceToken(endpoint.path)),
  ].filter((name): name is string => Boolean(name));

  for (const candidate of candidates) {
    if (findEntity(module, candidate)) return findEntity(module, candidate)!.name;
  }

  if (primaryEntities(module).length === 1) {
    return primaryEntities(module)[0]!.name;
  }

  return undefined;
}

function roleToForeignKeyField(role: string): string {
  return `${role.charAt(0).toLowerCase()}${role.slice(1)}Id`;
}

export function inferOwnershipField(
  module: KernelModule,
  endpoint: KernelEndpoint,
  resourceEntityName: string,
): string | undefined {
  const resource = findEntity(module, resourceEntityName);
  if (!resource) return undefined;

  const matches: string[] = [];
  for (const role of endpoint.roles) {
    const candidate = roleToForeignKeyField(role);
    const field = resource.fields.find((entry) => entry.name === candidate);
    if (field?.annotations.references) {
      matches.push(candidate);
    }
  }

  if (matches.length === 1) return matches[0];
  return undefined;
}

function findEndpointByWireKey(
  module: KernelModule,
  wireKey: string,
): KernelEndpoint | undefined {
  for (const service of module.services) {
    for (const endpoint of service.endpoints) {
      if (!endpoint.method || !endpoint.path) continue;
      if (normalizeWireKey(endpoint.method, endpoint.path) === wireKey) {
        return endpoint;
      }
    }
  }
  return undefined;
}

function findLoweredEndpoint(
  services: readonly WritableRecord[],
  endpointId: string,
): WritableRecord | undefined {
  for (const serviceSlice of services) {
    const service = serviceSlice["service"] as WritableRecord;
    const endpoints = service["endpoints"] as WritableRecord[] | undefined;
    if (!endpoints) continue;
    const match = endpoints.find((endpoint) => endpoint["id"] === endpointId);
    if (match) return match;
  }
  return undefined;
}

function ensureRequest(endpointIr: WritableRecord): WritableRecord {
  const existing = endpointIr["request"];
  if (existing && typeof existing === "object") return existing as WritableRecord;
  const created: WritableRecord = {};
  endpointIr["request"] = created;
  return created;
}

function ensureResponse(endpointIr: WritableRecord): WritableRecord {
  const existing = endpointIr["response"];
  if (existing && typeof existing === "object") return existing as WritableRecord;
  const created: WritableRecord = {};
  endpointIr["response"] = created;
  return created;
}

function entityExists(module: KernelModule, name: string): boolean {
  return module.entities.some((entity) => entity.name === name);
}

function inferCreateRequestEntity(domain: KernelEntity): KernelEntity {
  const skipNames = new Set(["createdAt", "updatedAt"]);
  return {
    name: `Create${domain.name}Request`,
    fields: domain.fields
      .filter(
        (field) =>
          !field.annotations.primary &&
          !skipNames.has(field.name) &&
          field.name !== "status",
      )
      .map((field) => ({
        name: field.name,
        type: field.type,
        array: field.array,
        optional: field.optional,
        annotations: {},
      })),
  };
}

function inferCreateResponseEntity(domain: KernelEntity): KernelEntity {
  const pk = domain.fields.find((field) => field.annotations.primary);
  const idName = pk
    ? `${domain.name.charAt(0).toLowerCase()}${domain.name.slice(1)}Id`
    : "id";
  return {
    name: `Create${domain.name}Response`,
    fields: [
      {
        name: idName,
        type: pk?.type ?? "UUID",
        array: false,
        optional: false,
        annotations: {},
      },
    ],
  };
}

function appendInferredEntity(modelSlice: WritableRecord, entity: KernelEntity): void {
  const model = modelSlice["model"] as WritableRecord;
  const entities = model["entities"] as WritableRecord[];
  if (entities.some((entry) => entry["name"] === entity.name)) return;

  entities.push({
    name: entity.name,
    fields: entity.fields.map((field) => ({
      name: field.name,
      type: field.type,
      array: field.array,
      optional: field.optional,
      ...(Object.keys(field.annotations).length > 0
        ? { annotations: field.annotations }
        : {}),
    })),
  });
}

function inferEndpointBodies(
  module: KernelModule,
  endpoint: KernelEndpoint,
  endpointIr: WritableRecord,
  modelSlice: WritableRecord,
  diagnostics: Diagnostic[],
): void {
  const resourceEntityName = inferResourceEntityName(module, endpoint);
  if (!resourceEntityName) return;

  if (ownershipNeedsFieldInference(endpointIr)) {
    const ownershipField = inferOwnershipField(module, endpoint, resourceEntityName);
    const authorization = endpointIr["authorization"] as WritableRecord;
    if (ownershipField) {
      const ownership = (authorization["ownership"] as WritableRecord | undefined) ?? {};
      ownership["field"] = ownershipField;
      authorization["ownership"] = ownership;
    } else if (endpoint.roles.length > 0) {
      diagnostics.push({
        provenance: Provenance.NotDerivable,
        target: `api.${endpoint.id}.ownership`,
        message: `${InferenceErrorCode.OwnerFieldAmbiguous}: could not infer FK field for ownership scope ${OwnershipScope.OwnRows} on ${endpoint.id}`,
      });
    }
  }

  if (modifierEnabled(endpointIr, IrModifierKey.Detail) && !endpoint.outputType) {
    const response = ensureResponse(endpointIr);
    if (!response["bodyRef"]) {
      response["bodyRef"] = resourceEntityName;
      response["provenance"] = Provenance.Inferred;
    }
  }

  if (modifierEnabled(endpointIr, IrModifierKey.List) && !endpoint.outputType) {
    const listResponseName = `${resourceEntityName}ListResponse`;
    const response = ensureResponse(endpointIr);
    if (!response["bodyRef"]) {
      if (entityExists(module, listResponseName)) {
        response["bodyRef"] = listResponseName;
        response["provenance"] = Provenance.Inferred;
      }
    }
  }

  if (modifierEnabled(endpointIr, IrModifierKey.Create)) {
    const domain = findEntity(module, resourceEntityName);
    if (!domain) {
      diagnostics.push({
        provenance: Provenance.NotDerivable,
        target: `api.${endpoint.id}.create`,
        message: `${InferenceErrorCode.ResourceEntityUnknown}: modifiers.create could not resolve domain entity for ${endpoint.id}`,
      });
      return;
    }

    const requestName = `Create${domain.name}Request`;
    const responseName = `Create${domain.name}Response`;

    if (!entityExists(module, requestName)) {
      appendInferredEntity(modelSlice, inferCreateRequestEntity(domain));
    }
    if (!entityExists(module, responseName)) {
      appendInferredEntity(modelSlice, inferCreateResponseEntity(domain));
    }

    if (!endpoint.inputType) {
      const request = ensureRequest(endpointIr);
      if (!request["bodyRef"]) {
        request["bodyRef"] = requestName;
        request["provenance"] = Provenance.Inferred;
      }
    }
    if (!endpoint.outputType) {
      const response = ensureResponse(endpointIr);
      if (!response["bodyRef"]) {
        response["bodyRef"] = responseName;
        response["provenance"] = Provenance.Inferred;
        if (!response["status"] && endpoint.method === "POST") {
          response["status"] = 201;
        }
      }
    }
  }
}

function inferIntegrationWireBodies(
  module: KernelModule,
  integrationIr: WritableRecord,
  diagnostics: Diagnostic[],
): void {
  const mapsTo = integrationIr["mapsTo"];
  if (typeof mapsTo !== "string" || mapsTo.length === 0) return;
  if (integrationIr["requestBody"] || integrationIr["responseBody"]) return;

  const endpoint = findEndpointByWireKey(module, mapsTo);
  if (!endpoint) {
    diagnostics.push({
      provenance: Provenance.NotDerivable,
      target: `integration.${integrationIr["name"]}`,
      message: `${InferenceErrorCode.MapsToUnresolved}: maps_to ${mapsTo} does not match any @api in module ${module.name}`,
    });
    return;
  }

  if (endpoint.inputType) {
    integrationIr["requestBody"] = endpoint.inputType;
  }
  if (endpoint.outputType) {
    integrationIr["responseBody"] = endpoint.outputType;
  }
}

/** Apply compile phase-11 inference to a lowered workspace (before schema parse). */
export function applyInference(
  program: KernelProgram,
  workspace: WritableRecord,
): InferenceResult {
  const diagnostics: Diagnostic[] = [];
  const modules = workspace["modules"] as WritableRecord[] | undefined;
  if (!modules) return { diagnostics };

  for (const moduleBundle of modules) {
    const moduleSlice = moduleBundle["module"] as WritableRecord;
    const modelSlice = moduleBundle["model"] as WritableRecord;
    const services = moduleBundle["services"] as WritableRecord[];
    const moduleName = (moduleSlice["module"] as WritableRecord)["name"] as string;
    const kernelModule = program.modules.find((mod) => mod.name === moduleName);
    if (!kernelModule) continue;

    const integrations = (moduleSlice["module"] as WritableRecord)["integrations"] as
      | WritableRecord[]
      | undefined;
    if (integrations) {
      for (const integrationIr of integrations) {
        inferIntegrationWireBodies(kernelModule, integrationIr, diagnostics);
      }
    }

    for (const service of kernelModule.services) {
      for (const endpoint of service.endpoints) {
        const endpointIr = findLoweredEndpoint(services, endpoint.id);
        if (!endpointIr) continue;
        inferEndpointBodies(kernelModule, endpoint, endpointIr, modelSlice, diagnostics);
      }
    }
  }

  return { diagnostics };
}
