export interface WorkspaceServiceFile {
  readonly path: string;
  readonly source: string;
  readonly serviceName: string;
}

export interface WorkspaceModuleFiles {
  readonly dirName: string;
  readonly modulePath: string;
  readonly moduleSource: string;
  readonly moduleName: string;
  readonly services: readonly WorkspaceServiceFile[];
  readonly featureFiles: ReadonlyMap<string, string>;
  readonly entityFiles: ReadonlyMap<string, string>;
}

export interface WorkspaceFiles {
  readonly rootDir: string;
  readonly productPath: string;
  readonly productSource: string;
  readonly pactiaTomlPath: string | undefined;
  readonly pactiaTomlSource: string | undefined;
  readonly pactiaLockPath: string | undefined;
  readonly pactiaLockSource: string | undefined;
  readonly modules: readonly WorkspaceModuleFiles[];
}

export interface MergedWorkspaceSource {
  readonly source: string;
  readonly entry: string;
  readonly lockfileDigest: string | undefined;
  readonly diagnostics?: readonly import("../../domain/diagnostics.js").Diagnostic[];
}
