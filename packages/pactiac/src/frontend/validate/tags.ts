import type { Diagnostic } from "../../diagnostics/diagnostic.js";
import { Provenance } from "../../diagnostics/diagnostic.js";
import type { KernelProgram } from "../kernel/extract.js";

export enum KernelTag {
  Api = "api",
  Entity = "entity",
  Auth = "auth",
  Stack = "stack",
}

/** Structural kernel tag checks until spec tag JSON schemas are normative. */
export function validateKernelTags(program: KernelProgram): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const mod of program.modules) {
    for (const service of mod.services) {
      for (const endpoint of service.endpoints) {
        if (!endpoint.method) {
          diagnostics.push({
            provenance: Provenance.NOT_DERIVABLE,
            target: `tag.${KernelTag.Api}.${endpoint.id}.method`,
            message: `@api ${endpoint.id} is missing method:`,
          });
        }
        if (!endpoint.path) {
          diagnostics.push({
            provenance: Provenance.NOT_DERIVABLE,
            target: `tag.${KernelTag.Api}.${endpoint.id}.path`,
            message: `@api ${endpoint.id} is missing path:`,
          });
        }
        if (
          !endpoint.isPublic &&
          endpoint.roles.length === 0 &&
          !endpoint.macros.some((macro) => /^(owner|buyer|seller|participant)/.test(macro))
        ) {
          diagnostics.push({
            provenance: Provenance.NOT_DERIVABLE,
            target: `tag.${KernelTag.Api}.${endpoint.id}.auth`,
            message: `@api ${endpoint.id} has no @auth, @public, or ownership macro`,
          });
        }
      }
    }

    for (const entity of mod.entities) {
      if (entity.fields.length === 0) {
        diagnostics.push({
          provenance: Provenance.NOT_DERIVABLE,
          target: `tag.${KernelTag.Entity}.${entity.name}`,
          message: `@entity ${entity.name} has no fields`,
        });
      }
    }
  }

  if (!program.product.stackPackage) {
    diagnostics.push({
      provenance: Provenance.NOT_DERIVABLE,
      target: `tag.${KernelTag.Stack}`,
      message: "product is missing @stack target",
    });
  }

  return diagnostics;
}
