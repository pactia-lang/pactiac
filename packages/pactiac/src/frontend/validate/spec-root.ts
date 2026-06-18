import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pactiacRepoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "..",
);

/** Resolve spec repo root for kernel tag catalog and JSON schemas. */
export function resolveSpecRoot(): string | undefined {
  const candidates: string[] = [];

  if (process.env["PACTIA_SPEC_ROOT"]) {
    candidates.push(resolve(process.env["PACTIA_SPEC_ROOT"]));
  }

  candidates.push(resolve(pactiacRepoRoot, "..", "spec"));
  candidates.push(resolve(pactiacRepoRoot, "spec"));

  return candidates.find((path) => existsSync(resolve(path, "registry", "kernel-tags.yaml")));
}

export function resolveKernelTagsCatalogPath(specRoot: string): string {
  return resolve(specRoot, "registry", "kernel-tags.yaml");
}

export function resolveTagSchemaPath(specRoot: string, relativeSchema: string): string {
  return resolve(specRoot, relativeSchema);
}
