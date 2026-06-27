import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { WorkspaceFiles } from "./types.js";

const PRODUCT_FILE = "product.pactia";
const PACTIA_TOML = "pactia.toml";
const PACTIA_LOCK = "pactia.lock";

function readOptional(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** Loads workspace manifests — import + attach only; no legacy folder scan. */
export function discoverWorkspace(rootDir: string): WorkspaceFiles {
  const root = resolve(rootDir);
  const productPath = join(root, PRODUCT_FILE);

  if (!existsSync(productPath)) {
    throw new Error(`Workspace root '${root}' has no ${PRODUCT_FILE}`);
  }

  const pactiaTomlPath = join(root, PACTIA_TOML);
  const pactiaLockPath = join(root, PACTIA_LOCK);

  return {
    rootDir: root,
    productPath,
    productSource: readFileSync(productPath, "utf8"),
    pactiaTomlPath: existsSync(pactiaTomlPath) ? pactiaTomlPath : undefined,
    pactiaTomlSource: readOptional(pactiaTomlPath),
    pactiaLockPath: existsSync(pactiaLockPath) ? pactiaLockPath : undefined,
    pactiaLockSource: readOptional(pactiaLockPath),
    modules: [],
  };
}
