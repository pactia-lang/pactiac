export enum SerializationFormat {
  Json = "json",
  Yaml = "yaml",
}

export function parseSerializationFormat(raw: string): SerializationFormat | undefined {
  const lower = raw.toLowerCase();
  if (lower === "json") {
    return SerializationFormat.Json;
  }
  if (lower === "yaml" || lower === "yml") {
    return SerializationFormat.Yaml;
  }

  return undefined;
}