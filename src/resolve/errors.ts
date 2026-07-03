/** Shared error codes for package resolution — single source of truth for both pactiac and pactia. */
export enum PackageErrorCode {
  PackageNotFound = "PACKAGE_NOT_FOUND",
  DependencyNotDeclared = "DEPENDENCY_NOT_DECLARED",
  LockEntryMissing = "LOCK_ENTRY_MISSING",
  PackageLockMismatch = "PACKAGE_LOCK_MISMATCH",
  /** Lockfile version is invalid (must be >= 1). */
  LockVersionInvalid = "LOCK_VERSION_INVALID",
  /** Remote version not found for the given semver range. */
  VersionNotFound = "VERSION_NOT_FOUND",
  /** Package coordinate is malformed. */
  InvalidCoordinate = "INVALID_COORDINATE",
  /** Git fetch (clone or ls-remote) failed. */
  GitFetchFailed = "GIT_FETCH_FAILED",
  /** HTTP request to registry API failed. */
  HttpFetchFailed = "HTTP_FETCH_FAILED",
  /** Config file (~/.pactia/config.toml) is missing or unreadable. */
  ConfigMissing = "CONFIG_MISSING",
}

export class PackageResolutionError extends Error {
  constructor(
    readonly code: PackageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PackageResolutionError";
  }
}
