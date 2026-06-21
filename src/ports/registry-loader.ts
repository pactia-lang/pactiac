import type { EffectiveRegistry } from "../domain/registry.js";

import type { SyntaxTree } from "../domain/syntax-tree.js";

export interface PackageManifestRef {
  readonly coordinate: string;
  readonly manifestPath: string;
  readonly indexPath: string;
}

export interface RegistryLoaderInput {
  readonly workspaceRoot: string;
  readonly importCoordinates: readonly string[];
  readonly stackCoordinate?: string;
  readonly syntax?: SyntaxTree;
  /** Partial symbol lists per package coordinate (from `import { … } from @scope/name`). */
  readonly partialImports?: ReadonlyMap<string, readonly string[]>;
}

export interface RegistryLoader {
  load(input: RegistryLoaderInput): Promise<EffectiveRegistry>;
}

export interface RegistryLoaderSync {
  load(input: RegistryLoaderInput): EffectiveRegistry;
}
