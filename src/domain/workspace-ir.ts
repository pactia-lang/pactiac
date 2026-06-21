/** Registry-written IR tree — slot shapes come from tag ir.path, not a fixed schema. */
export type IrJsonValue =
  | string
  | number
  | boolean
  | null
  | IrJsonObject
  | readonly IrJsonValue[];

export interface IrJsonObject {
  readonly [key: string]: IrJsonValue;
}

export interface WorkspaceIr {
  readonly manifest: IrJsonObject;
  readonly product: IrJsonObject;
  readonly modules: ReadonlyArray<{
    readonly module: IrJsonObject;
    readonly model: IrJsonObject;
    readonly services: ReadonlyArray<IrJsonObject>;
  }>;
}

export interface WorkspaceIrFiles {
  /** Relative paths under the IR output root (e.g. `input/product.json`). */
  readonly files: ReadonlyMap<string, string>;
  readonly workspace: WorkspaceIr;
}

export enum IrOutputRoot {
  Input = "input",
}

/** Relative path patterns for emitted JSON IR — spec/docs/compilation.md#ir-layout. */
export enum IrRelativePath {
  Manifest = "input/manifest.json",
  Product = "input/product.json",
  /** Single-file IR bundle for BSC — manifest, product, and all module slices inline. */
  Workspace = "input/workspace.json",
}

export function moduleIrPaths(moduleKebab: string): {
  readonly module: string;
  readonly model: string;
  readonly serviceDir: string;
} {
  const base = `input/modules/${moduleKebab}`;
  return {
    module: `${base}/${moduleKebab}.module.json`,
    model: `${base}/${moduleKebab}.model.json`,
    serviceDir: `${base}/services`,
  };
}

export function serviceIrPath(moduleKebab: string, serviceKebab: string): string {
  return `${moduleIrPaths(moduleKebab).serviceDir}/${serviceKebab}.service.json`;
}
