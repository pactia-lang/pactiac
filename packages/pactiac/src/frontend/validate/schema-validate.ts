import { readFileSync } from "node:fs";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { Diagnostic } from "../../diagnostics/diagnostic.js";
import { Provenance } from "../../diagnostics/diagnostic.js";
import type { KernelProgram } from "../kernel/extract.js";
import type { KernelTagCatalog } from "./catalog.js";
import { collectTagValidationInstances } from "./instances.js";

export enum TagValidationErrorCode {
  TagBodyInvalid = "TAG_BODY_INVALID",
  TagSchemaMissing = "TAG_SCHEMA_MISSING",
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const compiledByPath = new Map<string, ValidateFunction>();

function getValidator(schemaPath: string): ValidateFunction {
  let validate = compiledByPath.get(schemaPath);
  if (validate) return validate;

  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { $id?: string };
  if (schema.$id) {
    const existing = ajv.getSchema(schema.$id);
    if (existing) {
      compiledByPath.set(schemaPath, existing);
      return existing;
    }
  }

  validate = ajv.compile(schema);
  compiledByPath.set(schemaPath, validate);
  return validate;
}

export function validateTagSchemas(
  program: KernelProgram,
  catalog: KernelTagCatalog | undefined,
): Diagnostic[] {
  if (!catalog) return [];

  const diagnostics: Diagnostic[] = [];

  for (const instance of collectTagValidationInstances(program)) {
    const entry = catalog.entries.get(instance.tag);
    if (!entry?.normative) continue;

    let validate;
    try {
      validate = getValidator(entry.schemaPath);
    } catch {
      diagnostics.push({
        provenance: Provenance.NotDerivable,
        target: `tag.${instance.tag}.${instance.target}`,
        message: `${TagValidationErrorCode.TagSchemaMissing}: could not load schema for @${instance.tag}`,
      });
      continue;
    }

    if (!validate(instance.body)) {
      const detail = (validate.errors ?? [])
        .map((error: ErrorObject) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`)
        .join("; ");
      diagnostics.push({
        provenance: Provenance.NotDerivable,
        target: `tag.${instance.tag}.${instance.target}`,
        message: `${TagValidationErrorCode.TagBodyInvalid}: @${instance.tag} ${instance.target} — ${detail}`,
      });
    }
  }

  return diagnostics;
}
