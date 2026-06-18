import {
  irWorkspaceSchema,
  type IrWorkspace,
  ScenarioProvenance,
} from "@pactia/schema";
import { type Diagnostic, Provenance } from "./diagnostics.js";
import { emitYaml } from "./emit.js";
import { lowerScenarios } from "./lower-scenarios.js";
import { parseThenClause, parseWhenClause } from "./test-clauses.js";
import { extractV2Kernel, type V2Endpoint, type V2KernelProgram, type V2Module } from "./v2-kernel/extract.js";
import { serviceFileStem } from "./v2-kernel/text.js";

/** Fixed timestamp so compile output is byte-stable across runs. */
const COMPILED_AT = "1970-01-01T00:00:00.000Z";

function endpointAuthorization(endpoint: V2Endpoint) {
  if (endpoint.isPublic) {
    return { type: "PUBLIC" as const, roles: [] };
  }
  if (endpoint.macros.includes("owner")) {
    return {
      type: "OWNERSHIP" as const,
      roles: endpoint.roles,
      ownership: { scope: "OWN_ROWS" },
    };
  }
  if (endpoint.roles.length > 0) {
    return { type: "ROLE" as const, roles: endpoint.roles };
  }
  return undefined;
}

function lowerEndpoint(endpoint: V2Endpoint) {
  return {
    id: endpoint.id,
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary,
    authorization: endpointAuthorization(endpoint),
    request: endpoint.inputType ? { bodyRef: endpoint.inputType } : undefined,
    response: {
      ...(endpoint.outputType ? { bodyRef: endpoint.outputType } : {}),
      ...(endpoint.status ? { status: endpoint.status } : {}),
    },
    errors: endpoint.throws,
    emits: endpoint.emits,
    modifiers: endpoint.macros.length > 0 ? { macros: endpoint.macros } : undefined,
    provenance: Provenance.Pactia,
  };
}

function lowerModuleSlice(module: V2Module) {
  return {
    module: {
      name: module.name,
      actors: module.actors.map((actor) => ({
        id: actor.id,
        role: actor.role,
        capabilities: actor.capabilities,
      })),
      rules: module.rules.map((rule) => ({ id: rule.id, text: rule.text })),
      config:
        Object.keys(module.config).length > 0
          ? { profiles: module.config }
          : undefined,
      errors:
        Object.keys(module.errors).length > 0
          ? { catalog: module.errors }
          : undefined,
      integrations: module.integrations.map((integration) => ({
        name: integration.name,
        direction: integration.direction,
        auth: integration.authType
          ? {
              type: integration.authType,
              env: integration.authEnv,
            }
          : undefined,
        mapsTo: integration.mapsTo?.replace(/^"|"$/g, ""),
        purpose: integration.purpose,
      })),
      events: module.events.map((event) => ({
        id: event.id,
        payload: event.payload,
        handler: event.handler,
        description: event.description,
      })),
      eventHandlers: [],
      observe:
        module.observeSlos.length > 0
          ? { slos: module.observeSlos, alerts: [] }
          : undefined,
      dependsOn: [],
    },
  };
}

function lowerModelSlice(module: V2Module) {
  return {
    model: {
      name: module.name,
      enums: module.enums,
      entities: module.entities.map((entity) => ({
        name: entity.name,
        fields: entity.fields.map((field) => ({
          name: field.name,
          type: field.type,
          array: field.array,
          optional: field.optional,
          annotations:
            Object.keys(field.annotations).length > 0 ? field.annotations : undefined,
        })),
      })),
      relations: module.relations.map((relation) => ({
        id: relation.id,
        from: relation.from,
        to: relation.to,
        verb: relation.verb,
        cardinality: relation.cardinality as "many" | "one" | undefined,
      })),
      stateMachines: module.stateMachines.map((sm) => ({
        id: sm.id,
        entity: sm.entity,
        transitions: sm.transitions,
      })),
      rules: module.modelRules.map((rule) => ({ id: rule.id, text: rule.text })),
    },
  };
}

function lowerServiceSlice(module: V2Module, serviceName: string) {
  const service = module.services.find((candidate) => candidate.name === serviceName);
  if (!service) {
    throw new Error(`Service '${serviceName}' not found in module '${module.name}'`);
  }

  const loweredScenarios = lowerScenarios(service.scenarios).scenarios;

  return {
    service: {
      name: service.name,
      description: service.description,
      flags: service.flags,
      guide: service.guide,
      endpoints: service.endpoints.map(lowerEndpoint),
      scenarios: loweredScenarios,
      obligations: [],
    },
  };
}

export function lowerIrWorkspace(program: V2KernelProgram): IrWorkspace {
  const moduleBundles = program.modules.map((module) => ({
    module: lowerModuleSlice(module),
    model: lowerModelSlice(module),
    services: module.services.map((service) => lowerServiceSlice(module, service.name)),
  }));

  const manifestModules = program.modules.map((module) => ({
    name: module.name,
    path: `modules/${module.name}/`,
    module: `${module.name}.module.yaml`,
    model: `${module.name}.model.yaml`,
    services: module.services.map((service) => ({
      name: serviceFileStem(service.name),
      file: `services/${serviceFileStem(service.name)}.service.yaml`,
    })),
  }));

  const workspace: IrWorkspace = {
    manifest: {
      manifest: {
        pactiaVersion: program.version,
        compiledAt: COMPILED_AT,
        entry: "product.pactia",
        lockfileDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        modules: manifestModules,
        references: [],
      },
    },
    product: {
      product: {
        name: program.product.name,
        description: program.product.description,
        stackId: `@pactia/${program.product.stackPackage}`,
        topology: program.product.topologyMode
          ? { mode: program.product.topologyMode }
          : undefined,
        tenancy: program.product.tenancyMode
          ? { mode: program.product.tenancyMode }
          : undefined,
        guide: program.product.guide,
        surfaces: program.product.surfaces.map((surface) => ({
          id: surface.id,
          platform: surface.platform as "web" | "ios" | "android" | "desktop" | undefined,
          screen: surface.screenId
            ? {
                id: surface.screenId,
                ...(surface.routePath ? { route: { path: surface.routePath } } : {}),
                ...(surface.nav ? { nav: surface.nav } : {}),
              }
            : undefined,
          bind: surface.method && surface.path
            ? {
                service: surface.serviceName,
                method: surface.method,
                path: surface.path,
              }
            : undefined,
          description: surface.description,
        })),
        security: {},
        deployment:
          program.product.environments.length > 0 || program.product.gates.length > 0
            ? {
                id: program.product.deployId,
                environments: program.product.environments,
                gates: program.product.gates,
              }
            : undefined,
      },
    },
    modules: moduleBundles,
  };

  return irWorkspaceSchema.parse(workspace);
}

export function emitIrWorkspace(workspace: IrWorkspace): Map<string, string> {
  const files = new Map<string, string>();
  files.set("manifest.yaml", emitYaml(workspace.manifest));
  files.set("product.yaml", emitYaml(workspace.product));

  for (const moduleBundle of workspace.modules) {
    const moduleName = moduleBundle.module.module.name;
    const moduleBase = `modules/${moduleName}`;
    files.set(`${moduleBase}/${moduleName}.module.yaml`, emitYaml(moduleBundle.module));
    files.set(`${moduleBase}/${moduleName}.model.yaml`, emitYaml(moduleBundle.model));

    for (const serviceSlice of moduleBundle.services) {
      const stem = serviceFileStem(serviceSlice.service.name);
      files.set(
        `${moduleBase}/services/${stem}.service.yaml`,
        emitYaml(serviceSlice),
      );
    }
  }

  return files;
}

export function compileIrWorkspace(source: string): {
  workspace: IrWorkspace;
  files: Map<string, string>;
  diagnostics: Diagnostic[];
} {
  const program = extractV2Kernel(source);
  const workspace = lowerIrWorkspace(program);
  const files = emitIrWorkspace(workspace);

  const diagnostics: Diagnostic[] = [];

  if (!program.imports.includes("@pactia/protocol-rest")) {
    diagnostics.push({
      provenance: Provenance.NOT_DERIVABLE,
      target: "import.protocol-rest",
      message: "REST wire validation skipped — @pactia/protocol-rest not imported",
    });
  }

  const macroEndpoints = program.modules.flatMap((mod) =>
    mod.services.flatMap((svc) =>
      svc.endpoints.filter((ep) => ep.macros.length > 0).map((ep) => `${svc.name}.${ep.id}`),
    ),
  );
  if (macroEndpoints.length > 0) {
    diagnostics.push({
      provenance: Provenance.NOT_DERIVABLE,
      target: "macro.expansion",
      message: `Macro expansion not applied; recorded modifiers on: ${macroEndpoints.join(", ")}`,
    });
  }

  return { workspace, files, diagnostics };
}

/** Lower scenarios only — kept for focused tests. */
export function lowerScenarioDiagnostics(source: string): Diagnostic[] {
  const scenarios = extractV2Kernel(source).modules.flatMap((mod) =>
    mod.services.flatMap((svc) => svc.scenarios),
  );
  for (const scenario of scenarios) {
    if (!scenario.whenText || !scenario.thenText) continue;
    parseWhenClause(scenario.whenText);
    parseThenClause(scenario.thenText);
  }
  return scenarios.map(() => ({
    provenance: Provenance.Pactia,
    target: "scenario",
    message: "Scenario lowered",
  }));
}

export { ScenarioProvenance };
