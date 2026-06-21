import type { KernelEndpoint, KernelEntity, KernelModule } from "../frontend/kernel/extract.js";

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

export function deriveResourceEntityName(
  module: KernelModule,
  endpoint: KernelEndpoint,
): string | undefined {
  const candidates = [
    entityNameFromToken(endpointIdToResourceToken(endpoint.id)),
    entityNameFromToken(pathToResourceToken(endpoint.path)),
  ].filter((name): name is string => Boolean(name));

  for (const candidate of candidates) {
    const entity = findEntity(module, candidate);
    if (entity) return entity.name;
  }

  if (primaryEntities(module).length === 1) {
    return primaryEntities(module)[0]!.name;
  }

  return undefined;
}

function roleToForeignKeyField(role: string): string {
  return `${role.charAt(0).toLowerCase()}${role.slice(1)}Id`;
}

export function deriveOwnershipField(
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

export function entityExistsInModule(module: KernelModule, name: string): boolean {
  return module.entities.some((entity) => entity.name === name);
}

export function deriveListResponseName(resourceEntityName: string): string {
  return `${resourceEntityName}ListResponse`;
}

export function deriveCreateRequestName(domainName: string): string {
  return `Create${domainName}Request`;
}

export function deriveCreateResponseName(domainName: string): string {
  return `Create${domainName}Response`;
}

export function deriveCreateRequestEntity(domain: KernelEntity): KernelEntity {
  const skipNames = new Set(["createdAt", "updatedAt"]);
  return {
    name: deriveCreateRequestName(domain.name),
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

export function deriveCreateResponseEntity(domain: KernelEntity): KernelEntity {
  const pk = domain.fields.find((field) => field.annotations.primary);
  const idName = pk
    ? `${domain.name.charAt(0).toLowerCase()}${domain.name.slice(1)}Id`
    : "id";
  return {
    name: deriveCreateResponseName(domain.name),
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
