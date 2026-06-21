import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { Diagnostic } from "../../diagnostics/diagnostic.js";
import { Provenance } from "../../diagnostics/diagnostic.js";
import type { KernelProgram } from "../kernel/extract.js";
import type { LoadedPackage } from "../../resolve/loader.js";
import { parsePackageManifest, registryBlockFromManifest } from "../../resolve/package-manifest.js";

export enum ProtocolWireErrorCode {
  WireInvalid = "WIRE_INVALID",
  WireSchemaMissing = "WIRE_SCHEMA_MISSING",
}

export const PROTOCOL_REST_COORDINATE = "@pactia/protocol-rest";
const DEFAULT_WIRE_SCHEMA_RELATIVE = "schemas/api-wire-v1.json";

const pactiacRepoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "..",
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
const compiledByPath = new Map<string, ValidateFunction>();

function getWireValidator(schemaPath: string): ValidateFunction {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function vendorSearchRoots(): string[] {
  const roots = [join(pactiacRepoRoot, "test", "fixtures", "packages")];
  if (process.env["PACTIA_VENDOR_ROOT"]) {
    roots.unshift(resolve(process.env["PACTIA_VENDOR_ROOT"]));
  }
  return roots;
}

function packageDirName(coordinate: string, version = "1.0.0"): string {
  return `${coordinate.replace(/\//g, "--")}@${version}`;
}

function wireSchemaRelativeFromManifest(manifestSource: string | undefined): string {
  if (!manifestSource) return DEFAULT_WIRE_SCHEMA_RELATIVE;
  try {
    const parsed = parsePackageManifest(manifestSource);
    const registry = registryBlockFromManifest(parsed);
    const wireSchema = registry["wireSchema"];
    return typeof wireSchema === "string" ? wireSchema : DEFAULT_WIRE_SCHEMA_RELATIVE;
  } catch {
    return DEFAULT_WIRE_SCHEMA_RELATIVE;
  }
}

export function resolveProtocolRestPackageRoot(
  loadedPackages: readonly LoadedPackage[] = [],
): string | undefined {
  const loaded = loadedPackages.find((pkg) => pkg.coordinate === PROTOCOL_REST_COORDINATE);
  if (loaded) return loaded.rootDir;

  for (const vendorRoot of vendorSearchRoots()) {
    const dir = join(vendorRoot, packageDirName(PROTOCOL_REST_COORDINATE));
    if (existsSync(dir)) return dir;
  }

  return undefined;
}

export function resolveProtocolRestWireSchemaPath(
  loadedPackages: readonly LoadedPackage[] = [],
): string | undefined {
  const packageRoot = resolveProtocolRestPackageRoot(loadedPackages);
  if (!packageRoot) return undefined;

  const manifestPath = join(packageRoot, "pactia.package.json");
  const manifestSource = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : undefined;
  const relative = wireSchemaRelativeFromManifest(manifestSource);
  const schemaPath = join(packageRoot, relative);
  return existsSync(schemaPath) ? schemaPath : undefined;
}

export interface ProtocolWireValidationOptions {
  readonly loadedPackages?: readonly LoadedPackage[];
}

export function validateProtocolRestWire(
  program: KernelProgram,
  options: ProtocolWireValidationOptions = {},
): Diagnostic[] {
  if (!program.imports.includes(PROTOCOL_REST_COORDINATE)) {
    return [];
  }

  const schemaPath = resolveProtocolRestWireSchemaPath(options.loadedPackages ?? []);
  if (!schemaPath) {
    return [
      {
        provenance: Provenance.NotDerivable,
        target: "import.protocol-rest",
        message: `${ProtocolWireErrorCode.WireSchemaMissing}: @pactia/protocol-rest wire schema not found`,
      },
    ];
  }

  const validate = getWireValidator(schemaPath);
  const diagnostics: Diagnostic[] = [];

  for (const mod of program.modules) {
    for (const service of mod.services) {
      for (const endpoint of service.endpoints) {
        const body = {
          ...(endpoint.method ? { method: endpoint.method } : {}),
          ...(endpoint.path ? { path: endpoint.path } : {}),
        };
        if (!validate(body)) {
          const detail = (validate.errors ?? [])
            .map((error: ErrorObject) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`)
            .join("; ");
          diagnostics.push({
            provenance: Provenance.NotDerivable,
            target: `wire.protocol-rest.${endpoint.id}`,
            message: `${ProtocolWireErrorCode.WireInvalid}: @api ${endpoint.id} — ${detail}`,
          });
        }
      }
    }
  }

  return diagnostics;
}
