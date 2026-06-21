import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { LockReaderSync, PactiaLockfile } from "../ports/lock-reader.js";
import { parsePactiaLockToml } from "../resolve/toml-lock.js";

export class TomlLockReader implements LockReaderSync {
  read(input: { readonly workspaceRoot: string }): PactiaLockfile | undefined {
    const lockPath = join(input.workspaceRoot, "pactia.lock");
    if (!existsSync(lockPath)) return undefined;
    return parsePactiaLockToml(readFileSync(lockPath, "utf8"));
  }
}

export function readPactiaLock(source: string): PactiaLockfile {
  return parsePactiaLockToml(source);
}
