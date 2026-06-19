import type { KernelEntityField, KernelProgram } from "../kernel/extract.js";

export interface TagValidationInstance {
  readonly tag: string;
  readonly target: string;
  readonly body: Record<string, unknown>;
}

function guidanceText(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value.join("\n") : value;
}

function guideLines(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
}

function surfaceDescription(value: string | string[] | undefined): string | undefined {
  return guidanceText(value);
}

function collectFieldModifierInstances(
  entityName: string,
  field: KernelEntityField,
): TagValidationInstance[] {
  const instances: TagValidationInstance[] = [];
  const context = { entity: entityName, field: field.name };

  if (field.annotations.primary) {
    instances.push({ tag: "pk", target: `pk.${entityName}.${field.name}`, body: { ...context } });
  }
  if (field.annotations.unique) {
    instances.push({
      tag: "unique",
      target: `unique.${entityName}.${field.name}`,
      body: { ...context },
    });
  }
  if (field.annotations.nullable) {
    instances.push({
      tag: "nullable",
      target: `nullable.${entityName}.${field.name}`,
      body: { ...context },
    });
  }
  if (field.annotations.pii) {
    instances.push({
      tag: "pii",
      target: `pii.${entityName}.${field.name}`,
      body: { ...context },
    });
  }
  if (field.annotations.index) {
    instances.push({
      tag: "index",
      target: `index.${entityName}.${field.name}`,
      body: { ...context },
    });
  }
  if (field.annotations.references) {
    instances.push({
      tag: "fk",
      target: `fk.${entityName}.${field.name}`,
      body: {
        ...context,
        references: field.annotations.references,
      },
    });
  }
  if (field.annotations.retain) {
    instances.push({
      tag: "retain",
      target: `retain.${entityName}.${field.name}`,
      body: {
        ...context,
        period: field.annotations.retain.period,
        ...(field.annotations.retain.after ? { after: field.annotations.retain.after } : {}),
      },
    });
  }
  if (field.annotations.encryption) {
    instances.push({
      tag: "encrypt",
      target: `encrypt.${entityName}.${field.name}`,
      body: {
        ...context,
        scope: field.annotations.encryption.scope,
      },
    });
  }

  return instances;
}

/** Build JSON tag bodies from extracted kernel facts for schema validation. */
export function collectTagValidationInstances(program: KernelProgram): TagValidationInstance[] {
  const instances: TagValidationInstance[] = [];

  instances.push({
    tag: "stack",
    target: "product.stack",
    body: {},
  });

  if (program.product.topologyMode) {
    instances.push({
      tag: "topology",
      target: "product.topology",
      body: { mode: program.product.topologyMode },
    });
  }

  if (program.product.tenancyMode) {
    instances.push({
      tag: "tenancy",
      target: "product.tenancy",
      body: { mode: program.product.tenancyMode },
    });
  }

  const productGuideLines = guideLines(program.product.guide);
  if (productGuideLines) {
    instances.push({
      tag: "guide",
      target: "product.guide",
      body: { lines: productGuideLines },
    });
  }

  for (const surface of program.product.surfaces) {
    instances.push({
      tag: "surface",
      target: `surface.${surface.serviceName}.${surface.apiId}.${surface.platform ?? "unknown"}`,
      body: {
        id: surface.id,
        platform: surface.platform,
        apiId: surface.apiId,
        serviceName: surface.serviceName,
        ...(surface.screenId ? { screenId: surface.screenId } : {}),
        ...(surface.routePath ? { routePath: surface.routePath } : {}),
        ...(surface.nav ? { nav: surface.nav } : {}),
        ...(surfaceDescription(surface.description)
          ? { description: surfaceDescription(surface.description) }
          : {}),
      },
    });

    const bindTarget = `bind.${surface.serviceName}.${surface.apiId}.${surface.platform ?? "unknown"}`;
    instances.push({
      tag: "bind",
      target: bindTarget,
      body: surface.bind.data
        ? { data: surface.bind.data }
        : {
            service: surface.bind.service ?? surface.serviceName,
            endpoint: surface.bind.endpoint ?? surface.apiId,
            ...(surface.bind.method ? { method: surface.bind.method } : {}),
            ...(surface.bind.path ? { path: surface.bind.path } : {}),
          },
    });
  }

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

      for (const env of mod.deploy.environments) {
        instances.push({
          tag: "environment",
          target: `environment.${env.id}`,
          body: {
            id: env.id,
            ...(env.replicas !== undefined ? { replicas: env.replicas } : {}),
            ...(env.region ? { region: env.region } : {}),
          },
        });
      }

      for (const gate of mod.deploy.gates) {
        instances.push({
          tag: "gate",
          target: `gate.${gate.id}`,
          body: {
            id: gate.id,
            ...(gate.scenarios ? { scenarios: gate.scenarios } : {}),
            ...(gate.coverage ? { coverage: gate.coverage } : {}),
          },
        });
      }
    }

    for (const compliance of mod.compliances) {
      instances.push({
        tag: "compliance",
        target: `compliance.${compliance.id}`,
        body: {
          id: compliance.id,
          ...(compliance.framework ? { framework: compliance.framework } : {}),
          ...(compliance.appliesTo ? { applies_to: compliance.appliesTo } : {}),
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

    for (const security of mod.securityStatements) {
      instances.push({
        tag: "security",
        target: `security.${security.id}`,
        body: { id: security.id, text: security.text },
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

      for (const field of entity.fields) {
        instances.push(...collectFieldModifierInstances(entity.name, field));
      }
    }

    for (const enumDef of mod.enums) {
      instances.push({
        tag: "enum",
        target: `enum.${enumDef.name}`,
        body: { name: enumDef.name, values: enumDef.values },
      });
    }

    for (const relation of mod.relations) {
      instances.push({
        tag: "relation",
        target: `relation.${relation.id}`,
        body: {
          id: relation.id,
          from: relation.from,
          to: relation.to,
          ...(relation.verb ? { verb: relation.verb } : {}),
          ...(relation.cardinality ? { cardinality: relation.cardinality } : {}),
        },
      });
    }

    for (const stateMachine of mod.stateMachines) {
      instances.push({
        tag: "states",
        target: `states.${stateMachine.id}`,
        body: {
          id: stateMachine.id,
          entity: stateMachine.entity,
          transitions: stateMachine.transitions,
        },
      });
    }

    for (const service of mod.services) {
      const serviceGuideLines = guideLines(service.guide);
      if (serviceGuideLines) {
        instances.push({
          tag: "guide",
          target: `guide.${mod.name}.${service.name}`,
          body: { lines: serviceGuideLines },
        });
      }

      for (const scenario of service.scenarios) {
        if (!scenario.whenText || !scenario.thenText) continue;
        instances.push({
          tag: "test",
          target: `test.${scenario.id ?? scenario.name}`,
          body: {
            ...(scenario.id ? { id: scenario.id } : {}),
            name: scenario.name,
            when: scenario.whenText,
            then: scenario.thenText,
            service: service.name,
          },
        });
      }

      for (const obligation of service.obligations) {
        instances.push({
          tag: "must",
          target: `must.${obligation.id ?? obligation.on ?? "obligation"}`,
          body: {
            id: obligation.id ?? obligation.on ?? "obligation",
            ...(obligation.on && obligation.lines
              ? { on: obligation.on, lines: obligation.lines }
              : {}),
            ...(obligation.text ? { text: obligation.text } : {}),
          },
        });
      }

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
