function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePackageManifest(source: string): Record<string, unknown> {
  const trimmed = source.trim();
  if (trimmed.startsWith("{")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed)) {
      throw new Error("pactia.package.json must be a JSON object");
    }
    return parsed;
  }

  throw new Error("Unsupported package manifest format — expected pactia.package.json");
}

export function registryBlockFromManifest(
  manifest: Record<string, unknown>,
): Record<string, unknown> {
  const registry = manifest["registry"];
  return isRecord(registry) ? registry : manifest;
}
