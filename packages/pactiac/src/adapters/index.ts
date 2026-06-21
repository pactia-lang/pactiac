/**
 * Infrastructure adapters — fs, TOML lock, JSON emit, schema validation.
 */
export enum AdapterKind {
  FsRegistryLoader = "fs-registry-loader",
  TomlLockReader = "toml-lock-reader",
  RecursiveDescentParser = "recursive-descent-parser",
  JsonEmitter = "json-emitter",
  SchemaIrValidator = "schema-ir-validator",
}

export const adapterKinds: readonly AdapterKind[] = Object.values(AdapterKind);

export { emitJson, JsonIrEmitter, emitIrFileMap } from "./json-emitter.js";
export { TomlLockReader, readPactiaLock } from "./toml-lock-reader.js";
export { FsRegistryLoader, loadRegistryFromWorkspace } from "./fs-registry-loader.js";
