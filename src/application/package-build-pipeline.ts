import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Diagnostic } from "../domain/diagnostics.js";
import { DiagnosticCode, createDiagnostic } from "../domain/index.js";
import type { RegistryMacroEntry, RegistryTagEntry } from "../domain/registry.js";
import { emitJson } from "../adapters/json-emitter.js";
import { parseSyntaxTree } from "../passes/parse/recursive-descent-parser.js";
import { registryEntriesFromProgram } from "../passes/registry/build-effective-registry.js";
import { parsePackageManifest } from "../resolve/package-manifest.js";

export interface PackageBuildInput {
  readonly packageRoot: string;
}

export interface PackageBuildResult {
  readonly manifestPath: string;
  readonly diagnostics: readonly Diagnostic[];
}

function serializeTagEntry(entry: RegistryTagEntry): Record<string, unknown> {
  return {
    name: entry.name,
    in: entry.in,
    fields: entry.fields,
    ...(entry.modifier ? { modifier: true } : {}),
    ir: {
      file: entry.ir.file,
      path: entry.ir.path,
      merge: entry.ir.merge,
    },
  };
}

function serializeMacroEntry(entry: RegistryMacroEntry): Record<string, unknown> {
  return {
    name: entry.name,
    in: entry.in,
    ...(entry.params.length > 0 ? { params: entry.params } : {}),
    expandsTo: entry.body.lines,
  };
}

function manifestIdentity(manifestSource: string | undefined): {
  readonly name: string;
  readonly version: string;
  readonly kind: string;
} {
  if (!manifestSource) {
    return { name: "@unknown/package", version: "0.0.0", kind: "library" };
  }
  const manifest = parsePackageManifest(manifestSource);
  return {
    name: typeof manifest["name"] === "string" ? manifest["name"] : "@unknown/package",
    version: typeof manifest["version"] === "string" ? manifest["version"] : "0.0.0",
    kind: typeof manifest["kind"] === "string" ? manifest["kind"] : "library",
  };
}

/**
 * Package build pipeline — index.pactia export defs → pactia.package.json.
 * Separate from product compile per spec/docs/compilation.md.
 */
export class PackageBuildPipeline {
  build(input: PackageBuildInput): PackageBuildResult {
    const manifestPath = join(input.packageRoot, "pactia.package.json");
    const indexPath = join(input.packageRoot, "index.pactia");
    const diagnostics: Diagnostic[] = [];

    if (!existsSync(indexPath)) {
      diagnostics.push(createDiagnostic(DiagnosticCode.ParseError, "Package build requires index.pactia"));
      return { manifestPath, diagnostics };
    }

    const indexSource = readFileSync(indexPath, "utf8");
    let program;
    try {
      program = parseSyntaxTree({ source: indexSource, entryFile: "index.pactia" }).root;
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCode.ParseError,
          error instanceof Error ? error.message : "Failed to parse index.pactia",
        ),
      );
      return { manifestPath, diagnostics };
    }

    const existingManifestSource = existsSync(manifestPath)
      ? readFileSync(manifestPath, "utf8")
      : undefined;
    const identity = manifestIdentity(existingManifestSource);
    const { tags, macros } = registryEntriesFromProgram(
      program,
      identity.name,
      existingManifestSource,
    );

    const manifest = {
      name: identity.name,
      version: identity.version,
      kind: identity.kind,
      registry: {
        tags: tags.map(serializeTagEntry),
        macros: macros.map(serializeMacroEntry),
      },
    };

    writeFileSync(manifestPath, emitJson(manifest));

    return { manifestPath, diagnostics };
  }
}
