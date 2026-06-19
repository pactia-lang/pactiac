import type { KernelProgram } from "../kernel/extract.js";

export interface TagValidationInstance {
  readonly tag: string;
  readonly target: string;
  readonly body: Record<string, unknown>;
}

function guidanceText(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value.join("\n") : value;
}

/** Build JSON tag bodies from extracted kernel facts for schema validation. */
export function collectTagValidationInstances(program: KernelProgram): TagValidationInstance[] {
  const instances: TagValidationInstance[] = [];

  instances.push({
    tag: "stack",
    target: "product.stack",
    body: {},
  });

  for (const mod of program.modules) {
    for (const actor of mod.actors) {
      instances.push({
        tag: "actor",
        target: `actor.${actor.id}`,
        body: {
          id: actor.id,
          role: actor.role,
          capabilities: actor.capabilities,
        },
      });
    }

    if (mod.deploy) {
      instances.push({
        tag: "deploy",
        target: `deploy.${mod.deploy.id ?? mod.name}`,
        body: {
          ...(mod.deploy.id ? { id: mod.deploy.id } : {}),
          environments: mod.deploy.environments.map((env) => ({
            id: env.id,
            ...(env.replicas !== undefined ? { replicas: env.replicas } : {}),
            ...(env.region ? { region: env.region } : {}),
          })),
          ...(mod.deploy.gates.length > 0
            ? {
                gates: mod.deploy.gates.map((gate) => ({
                  id: gate.id,
                  ...(gate.scenarios ? { scenarios: gate.scenarios } : {}),
                  ...(gate.coverage ? { coverage: gate.coverage } : {}),
                })),
              }
            : {}),
        },
      });
    }

    for (const rule of [...mod.rules, ...mod.modelRules]) {
      instances.push({
        tag: "rule",
        target: `rule.${rule.id}`,
        body: { id: rule.id, text: rule.text },
      });
    }

    for (const [profile, entries] of Object.entries(mod.config)) {
      instances.push({
        tag: "config",
        target: `config.${profile}`,
        body: {
          profile,
          entries: Object.fromEntries(
            Object.entries(entries).map(([key, entry]) => [
              key,
              {
                ...(entry.required !== undefined ? { required: entry.required } : {}),
                ...(entry.secret ? { secret: true } : {}),
                ...(entry.default ? { default: entry.default } : {}),
                ...(guidanceText(entry.description)
                  ? { description: guidanceText(entry.description) }
                  : {}),
              },
            ]),
          ),
        },
      });
    }

    if (Object.keys(mod.errors).length > 0) {
      instances.push({
        tag: "errors",
        target: `errors.${mod.name}`,
        body: { catalog: mod.errors },
      });
    }

    for (const event of mod.events) {
      instances.push({
        tag: "event",
        target: `event.${event.id}`,
        body: {
          id: event.id,
          ...(event.payload ? { payload: event.payload } : {}),
          ...(event.handler ? { handler: event.handler } : {}),
          ...(guidanceText(event.description)
            ? { description: guidanceText(event.description) }
            : {}),
        },
      });
    }

    for (const integration of mod.integrations) {
      instances.push({
        tag: "integration",
        target: `integration.${integration.name}`,
        body: {
          name: integration.name,
          direction: integration.direction,
          ...(integration.authType
            ? {
                auth: {
                  type: integration.authType,
                  ...(integration.authEnv ? { env: integration.authEnv } : {}),
                },
              }
            : {}),
          ...(integration.mapsTo ? { mapsTo: integration.mapsTo.replace(/^"|"$/g, "") } : {}),
          ...(guidanceText(integration.purpose)
            ? { purpose: guidanceText(integration.purpose) }
            : {}),
        },
      });
    }

    if (mod.observeSlos.length > 0) {
      instances.push({
        tag: "observe",
        target: `observe.${mod.name}`,
        body: { slos: mod.observeSlos },
      });
    }

    for (const policy of mod.policies) {
      instances.push({
        tag: "policy",
        target: `policy.${policy.id}`,
        body: {
          id: policy.id,
          ...(policy.retainEntity && policy.retainPeriod
            ? {
                retain: {
                  entity: policy.retainEntity,
                  period: policy.retainPeriod,
                  ...(policy.retainReason ? { reason: policy.retainReason } : {}),
                },
              }
            : {}),
          ...(policy.residency ? { residency: policy.residency } : {}),
        },
      });
    }

    for (const entity of mod.entities) {
      instances.push({
        tag: "entity",
        target: `entity.${entity.name}`,
        body: {
          name: entity.name,
          fields: entity.fields.map((field) => ({
            name: field.name,
            type: field.type,
            ...(field.array ? { array: true } : {}),
            ...(field.optional ? { optional: true } : {}),
          })),
        },
      });
    }

    for (const service of mod.services) {
      for (const endpoint of service.endpoints) {
        instances.push({
          tag: "api",
          target: `api.${endpoint.id}`,
          body: {
            ...(endpoint.method ? { method: endpoint.method } : {}),
            ...(endpoint.path ? { path: endpoint.path } : {}),
          },
        });

        if (endpoint.isPublic) {
          instances.push({
            tag: "public",
            target: `public.${endpoint.id}`,
            body: {},
          });
        }

        if (endpoint.roles.length > 0) {
          instances.push({
            tag: "auth",
            target: `auth.${endpoint.id}`,
            body: { roles: endpoint.roles },
          });
        }

        if (endpoint.inputType) {
          instances.push({
            tag: "input",
            target: `input.${endpoint.id}`,
            body: { type: endpoint.inputType },
          });
        }

        if (endpoint.outputType) {
          instances.push({
            tag: "output",
            target: `output.${endpoint.id}`,
            body: { type: endpoint.outputType },
          });
        }

        if (endpoint.throws.length > 0) {
          instances.push({
            tag: "throws",
            target: `throws.${endpoint.id}`,
            body: { names: endpoint.throws },
          });
        }

        for (const event of endpoint.emits) {
          instances.push({
            tag: "emit",
            target: `emit.${endpoint.id}.${event}`,
            body: { event },
          });
        }

        if (endpoint.status !== undefined) {
          instances.push({
            tag: "status",
            target: `status.${endpoint.id}`,
            body: { status: endpoint.status },
          });
        }
      }
    }
  }

  return instances;
}
