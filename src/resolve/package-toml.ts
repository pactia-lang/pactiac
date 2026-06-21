import { PackageKind } from "./package-kind.js";

export interface PactiaPackageToml {
  readonly name: string;
  readonly version: string;
  readonly kind: PackageKind;
  readonly description: string | undefined;
  readonly dependencies: ReadonlyMap<string, string>;
  readonly wireSchema: string | undefined;
}

type TomlSection = "none" | "package" | "dependencies" | "protocol";

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function parseKind(value: string): PackageKind {
  switch (value) {
    case PackageKind.Stack:
      return PackageKind.Stack;
    case PackageKind.Vertical:
      return PackageKind.Vertical;
    case PackageKind.Protocol:
      return PackageKind.Protocol;
    case PackageKind.Surface:
      return PackageKind.Surface;
    case PackageKind.Library:
      return PackageKind.Library;
    default:
      return PackageKind.Library;
  }
}

/** Parse a publishable package manifest (`pactia.toml` at package root). */
export function parsePackageToml(source: string): PactiaPackageToml {
  let name = "@unknown/package";
  let version = "0.0.0";
  let kind = PackageKind.Library;
  let description: string | undefined;
  const dependencies = new Map<string, string>();
  let wireSchema: string | undefined;
  let section: TomlSection = "none";

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    if (line === "[package]") {
      section = "package";
      continue;
    }
    if (line === "[dependencies]") {
      section = "dependencies";
      continue;
    }
    if (line === "[protocol]") {
      section = "protocol";
      continue;
    }
    if (line.startsWith("[")) {
      section = "none";
      continue;
    }

    const kv = /^([^=]+)=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const key = unquote(kv[1]!.trim());
    const value = unquote(kv[2]!.trim());

    if (section === "package") {
      if (key === "name") name = value;
      else if (key === "version") version = value;
      else if (key === "kind") kind = parseKind(value);
      else if (key === "description") description = value;
    } else if (section === "dependencies") {
      dependencies.set(key, value);
    } else if (section === "protocol" && (key === "wire-schema" || key === "wireSchema")) {
      wireSchema = value;
    }
  }

  return { name, version, kind, description, dependencies, wireSchema };
}
