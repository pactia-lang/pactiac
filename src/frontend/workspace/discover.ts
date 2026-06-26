import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { WorkspaceFiles, WorkspaceModuleFiles, WorkspaceServiceFile } from "./types.js";

const PRODUCT_FILE = "product.pactia";
const MODULE_FILE = "module.pactia";
const PACTIA_TOML = "pactia.toml";
const PACTIA_LOCK = "pactia.lock";

function readOptional(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function parseModuleName(source: string, fallback: string): string {
  const match = /^\s*module\s+(\w+)\s*\{/m.exec(source);
  return match?.[1] ?? fallback;
}

function parseServiceName(source: string, filePath: string): string {
  const match = /service\s+(\w+)\s*\{/.exec(source);
  if (!match) {
    throw new Error(`Service file '${filePath}' is missing a service declaration`);
  }
  return match[1]!;
}

function collectPactiaFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => join(dir, name))
    .sort();
}

/** Legacy folder scan — deprecated; normative assembly uses import + attach in product.pactia. */
function discoverModule(moduleDir: string): WorkspaceModuleFiles | undefined {
  const modulePath = join(moduleDir, MODULE_FILE);
  if (!existsSync(modulePath)) return undefined;

  const dirName = moduleDir.split("/").pop() ?? moduleDir;
  const moduleSource = readFileSync(modulePath, "utf8");
  const moduleName = parseModuleName(moduleSource, dirName);

  const servicesDir = join(moduleDir, "services");
  const servicePaths = collectPactiaFiles(servicesDir, ".service.pactia");
  const services: WorkspaceServiceFile[] = servicePaths.map((path) => {
    const source = readFileSync(path, "utf8");
    return { path, source, serviceName: parseServiceName(source, path) };
  });

  const featuresDir = join(moduleDir, "features");
  const featureFiles = new Map<string, string>();
  for (const featurePath of collectPactiaFiles(featuresDir, ".pactia")) {
    featureFiles.set(featurePath, readFileSync(featurePath, "utf8"));
  }

  const entitiesDir = join(moduleDir, "entities");
  const entityFiles = new Map<string, string>();
  for (const entityPath of collectPactiaFiles(entitiesDir, ".pactia")) {
    entityFiles.set(entityPath, readFileSync(entityPath, "utf8"));
  }

  return {
    dirName,
    modulePath,
    moduleSource,
    moduleName,
    services,
    featureFiles,
    entityFiles,
  };
}

/** Loads workspace manifests; optional legacy modules/ scan when attach is absent. */
export function discoverWorkspace(rootDir: string): WorkspaceFiles {
  const root = resolve(rootDir);
  const productPath = join(root, PRODUCT_FILE);

  if (!existsSync(productPath)) {
    throw new Error(`Workspace root '${root}' has no ${PRODUCT_FILE}`);
  }

  const modulesDir = join(root, "modules");
  const modules: WorkspaceModuleFiles[] = [];
  if (existsSync(modulesDir)) {
    for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const mod = discoverModule(join(modulesDir, entry.name));
      if (mod) modules.push(mod);
    }
  }

  modules.sort((left, right) => left.moduleName.localeCompare(right.moduleName));

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
    modules,
  };
}
