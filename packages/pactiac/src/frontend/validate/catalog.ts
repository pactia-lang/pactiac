import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  resolveKernelTagsCatalogPath,
  resolveSpecRoot,
  resolveTagSchemaPath,
} from "./spec-root.js";

export interface KernelTagCatalogEntry {
  readonly name: string;
  readonly schemaPath: string;
  readonly normative: boolean;
}

export interface KernelTagCatalog {
  readonly specRoot: string;
  readonly entries: ReadonlyMap<string, KernelTagCatalogEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNormativeSchema(schema: Record<string, unknown>): boolean {
  if (Array.isArray(schema["required"]) && schema["required"].length > 0) {
    return true;
  }
  const properties = schema["properties"];
  if (isRecord(properties) && Object.keys(properties).length > 0) {
    return true;
  }
  if (schema["type"] === "object" && schema["additionalProperties"] === false) {
    return true;
  }
  const oneOf = schema["oneOf"];
  if (Array.isArray(oneOf)) {
    return oneOf.some((entry) => isRecord(entry) && isNormativeSchema(entry));
  }
  const anyOf = schema["anyOf"];
  if (Array.isArray(anyOf)) {
    return anyOf.some((entry) => isRecord(entry) && isNormativeSchema(entry));
  }
  return false;
}

export function loadKernelTagCatalog(specRoot?: string): KernelTagCatalog | undefined {
  const root = specRoot ?? resolveSpecRoot();
  if (!root) return undefined;

  const catalogSource = readFileSync(resolveKernelTagsCatalogPath(root), "utf8");
  const parsed = parseYaml(catalogSource);
  if (!isRecord(parsed) || !Array.isArray(parsed["tags"])) {
    return undefined;
  }

  const entries = new Map<string, KernelTagCatalogEntry>();

  for (const tag of parsed["tags"] as unknown[]) {
    if (!isRecord(tag) || typeof tag["name"] !== "string") continue;
    const schemaRef = tag["schema"];
    if (typeof schemaRef !== "string") continue;

    const schemaFile = resolveTagSchemaPath(root, schemaRef);
    let normative = false;
    try {
      const schemaJson = JSON.parse(readFileSync(schemaFile, "utf8")) as Record<string, unknown>;
      normative = isNormativeSchema(schemaJson);
    } catch {
      normative = false;
    }

    entries.set(tag["name"], {
      name: tag["name"],
      schemaPath: schemaFile,
      normative,
    });
  }

  return { specRoot: root, entries };
}
