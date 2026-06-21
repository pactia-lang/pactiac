import { parsePackageToml } from "./package-toml.js";

export enum PackageKind {
  Stack = "stack",
  Vertical = "vertical",
  Protocol = "protocol",
  Surface = "surface",
  Library = "library",
}

export function packageKindFromToml(manifestSource: string | undefined): PackageKind | undefined {
  if (!manifestSource) {
    return undefined;
  }
  try {
    return parsePackageToml(manifestSource).kind;
  } catch {
    return undefined;
  }
}

export function isStackPackage(manifestSource: string | undefined): boolean {
  return packageKindFromToml(manifestSource) === PackageKind.Stack;
}
