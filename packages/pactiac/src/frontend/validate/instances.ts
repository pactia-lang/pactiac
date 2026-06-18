import type { KernelProgram } from "../kernel/extract.js";

export interface TagValidationInstance {
  readonly tag: string;
  readonly target: string;
  readonly body: Record<string, unknown>;
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
      }
    }
  }

  return instances;
}
