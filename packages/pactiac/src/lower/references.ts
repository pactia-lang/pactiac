import type { KernelProgram } from "../frontend/kernel/extract.js";

export interface ManifestReferenceEndpoint {
  readonly module: string;
  readonly entity: string;
  readonly field: string;
}

export interface ManifestReference {
  readonly from: ManifestReferenceEndpoint;
  readonly to: {
    readonly module: string;
    readonly entity: string;
    readonly field?: string;
  };
}

function entityModuleIndex(program: KernelProgram): Map<string, string> {
  const index = new Map<string, string>();
  for (const mod of program.modules) {
    for (const entity of mod.entities) {
      index.set(entity.name, mod.name);
    }
  }
  return index;
}

/** Collect cross-module @fk edges for manifest.references[]. */
export function collectManifestReferences(program: KernelProgram): ManifestReference[] {
  const entityModules = entityModuleIndex(program);
  const references: ManifestReference[] = [];

  for (const mod of program.modules) {
    for (const entity of mod.entities) {
      for (const field of entity.fields) {
        const ref = field.annotations.references;
        if (!ref) continue;

        const targetEntity = ref.entity;
        const targetModule = entityModules.get(targetEntity);
        if (!targetModule || targetModule === mod.name) continue;

        references.push({
          from: { module: mod.name, entity: entity.name, field: field.name },
          to: {
            module: targetModule,
            entity: targetEntity,
            ...(ref.field ? { field: ref.field } : {}),
          },
        });
      }
    }
  }

  return references;
}
