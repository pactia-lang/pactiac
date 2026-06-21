import { FsRegistryLoader } from "../adapters/fs-registry-loader.js";
import { TomlLockReader } from "../adapters/toml-lock-reader.js";
import { parseSyntaxTree } from "../passes/parse/recursive-descent-parser.js";
import type { CompilePipelinePorts } from "./compile-context.js";

export function createDefaultCompilePipelinePorts(): CompilePipelinePorts {
  return {
    parser: { parse: (input) => parseSyntaxTree(input) },
    registryLoader: new FsRegistryLoader(),
    lockReader: new TomlLockReader(),
    irEmitter: { emit: () => ({ writtenPaths: [] }) },
    irValidator: {
      validate: () => ({ diagnostics: [] }),
    },
  };
}
