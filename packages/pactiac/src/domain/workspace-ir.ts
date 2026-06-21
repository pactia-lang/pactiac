import type { IrWorkspace } from "@pactia/schema";

/** L2 workspace IR — JSON tree keyed by product/module/model/service paths. */
export type WorkspaceIr = IrWorkspace;

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
