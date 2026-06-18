import {
  irWorkspaceSchema,
  type IrWorkspace,
  ScenarioProvenance,
} from "@pactia/schema";
import { type Diagnostic, Provenance } from "../diagnostics/diagnostic.js";
import { emitYaml } from "../emit/yaml.js";
import { validateKernelTags } from "../frontend/validate/tags.js";
import { lowerScenarios } from "../frontend/scenarios/lower.js";
import { parseThenClause, parseWhenClause } from "../frontend/scenarios/clauses.js";
import { extractKernel, type KernelDeploy, type KernelEndpoint, type KernelProgram, type KernelModule } from "../frontend/kernel/extract.js";
import { serviceFileStem } from "../frontend/kernel/text.js";
import { BuiltinMacro, expandEndpointMacros, parseMacroName } from "./macros.js";
import { collectManifestReferences } from "./references.js";
import type { EffectiveRegistry } from "../resolve/registry.js";

/** Fixed timestamp so compile output is byte-stable across runs. */
const COMPILED_AT = "1970-01-01T00:00:00.000Z";

const PLACEHOLDER_LOCKFILE_DIGEST =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000";

export interface LowerIrOptions {
  readonly entry?: string;
  readonly lockfileDigest?: string;
  readonly packagesResolved?: boolean;
  readonly effectiveRegistry?: EffectiveRegistry;
}

function ownershipScopeFromMacros(macros: readonly string[]): string | undefined {
  const names = new Set(macros.map(parseMacroName));
  if (names.has(BuiltinMacro.Owner)) return "OWN_ROWS";
  if (names.has(BuiltinMacro.Buyer)) return "PARTY_BUYER";
  if (names.has(BuiltinMacro.Seller)) return "PARTY_SELLER";
  if (names.has(BuiltinMacro.Participant)) return "PARTY_PARTICIPANT";
  return undefined;
}

function endpointAuthorization(endpoint: KernelEndpoint) {
  if (endpoint.isPublic) {
    return { type: "PUBLIC" as const, roles: [] };
  }
  const ownershipScope = ownershipScopeFromMacros(endpoint.macros);
  if (ownershipScope) {
    return {
      type: "OWNERSHIP" as const,
      roles: endpoint.roles,
      ownership: { scope: ownershipScope },
    };
  }
  if (endpoint.roles.length > 0) {
    return { type: "ROLE" as const, roles: endpoint.roles };
  }
  return undefined;
}

function lowerEndpoint(endpoint: KernelEndpoint, effectiveRegistry?: EffectiveRegistry) {
  const { modifiers } = expandEndpointMacros(endpoint.macros, effectiveRegistry);

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
    modifiers: Object.keys(modifiers).length > 0 ? modifiers : undefined,
    provenance: Provenance.Pactia,
  };
}

function lowerModuleSlice(module: KernelModule) {
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

function lowerModelSlice(module: KernelModule) {
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

function lowerServiceSlice(
  module: KernelModule,
  serviceName: string,
  effectiveRegistry?: EffectiveRegistry,
) {
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
      endpoints: service.endpoints.map((endpoint) =>
        lowerEndpoint(endpoint, effectiveRegistry),
      ),
      scenarios: loweredScenarios,
      obligations: [],
    },
  };
}

function aggregateDeployment(modules: readonly KernelModule[]): KernelDeploy | undefined {
  return modules.find((module) => module.deploy)?.deploy;
}

function aggregateSecurity(modules: readonly KernelModule[]): Record<string, unknown> {
  const statements = modules.flatMap((module) =>
    module.securityStatements.map((statement) => ({
      id: statement.id,
      module: module.name,
      text: statement.text,
    })),
  );
  const policies = modules.flatMap((module) =>
    module.policies.map((policy) => ({
      id: policy.id,
      module: module.name,
      ...(policy.retainEntity
        ? {
            retain: {
              entity: policy.retainEntity,
              period: policy.retainPeriod,
              reason: policy.retainReason,
            },
          }
        : {}),
      ...(policy.residency ? { residency: policy.residency } : {}),
    })),
  );
  if (statements.length === 0 && policies.length === 0) {
    return {};
  }
  return {
    ...(statements.length > 0 ? { statements } : {}),
    ...(policies.length > 0 ? { policies } : {}),
  };
}

export function lowerIrWorkspace(program: KernelProgram, options: LowerIrOptions = {}): IrWorkspace {
  const effectiveRegistry = options.effectiveRegistry;
  const moduleBundles = program.modules.map((module) => ({
    module: lowerModuleSlice(module),
    model: lowerModelSlice(module),
    services: module.services.map((service) =>
      lowerServiceSlice(module, service.name, effectiveRegistry),
    ),
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
        entry: options.entry ?? "product.pactia",
        lockfileDigest: options.lockfileDigest ?? PLACEHOLDER_LOCKFILE_DIGEST,
        modules: manifestModules,
        references: collectManifestReferences(program),
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
          bind: {
            service: surface.serviceName,
            endpoint: surface.apiId,
          },
          description: surface.description,
        })),
        security: aggregateSecurity(program.modules),
        deployment: (() => {
          const deployment = aggregateDeployment(program.modules);
          if (!deployment) return undefined;
          return {
            id: deployment.id,
            environments: deployment.environments,
            gates: deployment.gates,
          };
        })(),
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

export function compileIrWorkspace(
  source: string,
  options: LowerIrOptions = {},
): {
  workspace: IrWorkspace;
  files: Map<string, string>;
  diagnostics: Diagnostic[];
} {
  const program = extractKernel(source);
  const workspace = lowerIrWorkspace(program, options);
  const files = emitIrWorkspace(workspace);

  const diagnostics: Diagnostic[] = [];

  const protocolRestImported = program.imports.includes("@pactia/protocol-rest");
  if (!protocolRestImported) {
    diagnostics.push({
      provenance: Provenance.NOT_DERIVABLE,
      target: "import.protocol-rest",
      message: "REST wire validation skipped — @pactia/protocol-rest not imported",
    });
  } else if (!options.packagesResolved) {
    diagnostics.push({
      provenance: Provenance.NOT_DERIVABLE,
      target: "import.protocol-rest",
      message: "REST wire validation skipped — package resolver not run",
    });
  }

  const macroEndpoints = program.modules.flatMap((mod) =>
    mod.services.flatMap((svc) =>
      svc.endpoints.flatMap((ep) =>
        expandEndpointMacros(ep.macros, options.effectiveRegistry).unknownMacros,
      ),
    ),
  );
  if (macroEndpoints.length > 0) {
    diagnostics.push({
      provenance: Provenance.NOT_DERIVABLE,
      target: "macro.expansion",
      message: `Unknown macros: ${macroEndpoints.join(", ")}`,
    });
  }

  diagnostics.push(...validateKernelTags(program));

  return { workspace, files, diagnostics };
}

/** Lower scenarios only — kept for focused tests. */
export function lowerScenarioDiagnostics(source: string): Diagnostic[] {
  const scenarios = extractKernel(source).modules.flatMap((mod) =>
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
