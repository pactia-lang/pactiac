export enum PackageErrorCode {
  PackageNotFound = "PACKAGE_NOT_FOUND",
  DependencyNotDeclared = "DEPENDENCY_NOT_DECLARED",
  LockEntryMissing = "LOCK_ENTRY_MISSING",
  StackBindingMismatch = "STACK_BINDING_MISMATCH",
  PackageLockMismatch = "PACKAGE_LOCK_MISMATCH",
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
