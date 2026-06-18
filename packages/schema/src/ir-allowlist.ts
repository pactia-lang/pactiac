import { IrModuleRelativePattern, IrRootFile } from "./enums.js";

const MODULE_FILE_PATTERN =
  /^modules\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.module\.yaml$/;
const MODEL_FILE_PATTERN =
  /^modules\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.model\.yaml$/;
const SERVICE_FILE_PATTERN =
  /^modules\/[a-z0-9]+(?:-[a-z0-9]+)*\/services\/[a-z0-9]+(?:-[a-z0-9]+)*\.service\.yaml$/;

const PLACEHOLDER_MODULE = "{moduleKebab}";
const PLACEHOLDER_SERVICE = "{serviceKebab}";

export const irRootAllowlist = Object.values(IrRootFile);

export const irModuleRelativeAllowlist = Object.values(IrModuleRelativePattern);

export function isAllowlistedIrFilePath(filePath: string): boolean {
  if (irRootAllowlist.includes(filePath as IrRootFile)) {
    return true;
  }

  if (MODULE_FILE_PATTERN.test(filePath) || MODEL_FILE_PATTERN.test(filePath)) {
    return true;
  }

  if (SERVICE_FILE_PATTERN.test(filePath)) {
    return true;
  }

  const normalized = filePath.replaceAll(PLACEHOLDER_MODULE, "example").replaceAll(
    PLACEHOLDER_SERVICE,
    "example",
  );

  return (
    MODULE_FILE_PATTERN.test(normalized) ||
    MODEL_FILE_PATTERN.test(normalized) ||
    SERVICE_FILE_PATTERN.test(normalized)
  );
}
