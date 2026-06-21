export interface LockPackageEntry {
  readonly name: string;
  readonly version: string;
  readonly digest: string;
  readonly source?: string;
}

export interface PactiaLockfile {
  readonly packages: readonly LockPackageEntry[];
}

export interface LockReaderInput {
  readonly workspaceRoot: string;
}

export interface LockReader {
  read(input: LockReaderInput): Promise<PactiaLockfile | undefined>;
}

export interface LockReaderSync {
  read(input: LockReaderInput): PactiaLockfile | undefined;
}
