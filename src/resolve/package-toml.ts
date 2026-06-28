export interface PactiaPackageToml {
  readonly name: string;
  readonly version: string;
  readonly description: string | undefined;
  readonly dependencies: ReadonlyMap<string, string>;
  /** Declared export profile: \"registry\" (default) | \"topology\". */
  readonly exports: string | undefined;
  /** Opt-in for packages that export both registry defs and topology exports. */
  readonly mixedExports: boolean;
}

type TomlSection = "none" | "package" | "dependencies";

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

/** Parse a publishable package manifest (`pactia.toml` at package root). */
export function parsePackageToml(source: string): PactiaPackageToml {
  let name = "@unknown/package";
  let version = "0.0.0";
  let description: string | undefined;
  let mixedExports = false;
  let exports: string | undefined;
  const dependencies = new Map<string, string>();
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
      else if (key === "description") description = value;
      else if (key === "mixed-exports" && value === "true") mixedExports = true;
      else if (key === "exports") exports = value;
    } else if (section === "dependencies") {
      dependencies.set(key, value);
    }
  }

  return { name, version, description, dependencies, exports, mixedExports };
}
