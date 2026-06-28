/** Compiler diagnostic codes — normative subset from spec/docs/grammar-reference.md. */
export enum DiagnosticCode {
  // Registry
  UnknownSymbol = "UNKNOWN_SYMBOL",
  DefInProduct = "DEF_IN_PRODUCT",
  DefPlacementRequired = "DEF_PLACEMENT_REQUIRED",
  PlacementViolation = "PLACEMENT_VIOLATION",
  RegistryCollision = "REGISTRY_COLLISION",
  DependencyNotDeclared = "DEPENDENCY_NOT_DECLARED",
  VersionInImport = "VERSION_IN_IMPORT",
  MacroUnknown = "MACRO_UNKNOWN",
  MacroArgsInvalid = "MACRO_ARGS_INVALID",
  MacroExpansionCycle = "MACRO_EXPANSION_CYCLE",
  MacroExpansionInvalid = "MACRO_EXPANSION_INVALID",

  // Tag bodies
  TagBodyMissingField = "TAG_BODY_MISSING_FIELD",
  TagBodyUnknownField = "TAG_BODY_UNKNOWN_FIELD",
  TagBodyInvalid = "TAG_BODY_INVALID",
  ClauseDuplicateKey = "CLAUSE_DUPLICATE_KEY",

  // Package resolution
  PackageNotFound = "PACKAGE_NOT_FOUND",
  PackageLockMismatch = "PACKAGE_LOCK_MISMATCH",
  LockEntryMissing = "LOCK_ENTRY_MISSING",

  // Version / parse
  UnsupportedVersion = "UNSUPPORTED_VERSION",
  ParseError = "PARSE_ERROR",
  ConstantUndefined = "CONSTANT_UNDEFINED",

  // Workspace attach
  ImportUnused = "IMPORT_UNUSED",
  AttachUndefined = "ATTACH_UNDEFINED",
  AttachKindMismatch = "ATTACH_KIND_MISMATCH",
  ContextImportUnused = "CONTEXT_IMPORT_UNUSED",
  ContextAttachUndefined = "CONTEXT_ATTACH_UNDEFINED",
  ContextAttachKindMismatch = "CONTEXT_ATTACH_KIND_MISMATCH",
  ContextMissingPath = "CONTEXT_MISSING_PATH",
  FragmentPackageImport = "FRAGMENT_PACKAGE_IMPORT",

  // Package constants
  ConstantDefRequired = "CONSTANT_DEF_REQUIRED",
  ExportKindAmbiguity = "EXPORT_KIND_AMBIGUITY",

  // Topology packages (1.3)
  TopologyDefForbidden = "TOPOLOGY_DEF_FORBIDDEN",
  TopologyWildcardForbidden = "TOPOLOGY_WILDCARD_FORBIDDEN",
  PackageExportMixed = "PACKAGE_EXPORT_MIXED",
  ExportNotDeclared = "EXPORT_NOT_DECLARED",
  TopologyNestedExport = "TOPOLOGY_NESTED_EXPORT",
  TopologyMultipleRootExports = "TOPOLOGY_MULTIPLE_ROOT_EXPORTS",
  TopologyManifestInlineExport = "TOPOLOGY_MANIFEST_INLINE_EXPORT",
  TopologyExportFileMissing = "TOPOLOGY_EXPORT_FILE_MISSING",
  PackageProfileMismatch = "PACKAGE_PROFILE_MISMATCH",
  HybridPackageDiscouraged = "HYBRID_PACKAGE_DISCOURAGED",
  PackageImportMixed = "PACKAGE_IMPORT_MIXED",
  TopologyDuplicateService = "TOPOLOGY_DUPLICATE_SERVICE",
}

export enum DiagnosticSeverity {
  Error = "error",
  Warning = "warning",
}

/** Codes that represent warnings rather than hard errors. */
export const diagnosticWarningCodes: ReadonlySet<DiagnosticCode> = new Set([
  DiagnosticCode.TagBodyMissingField,
  DiagnosticCode.TagBodyUnknownField,
  DiagnosticCode.ClauseDuplicateKey,
  DiagnosticCode.ImportUnused,
  DiagnosticCode.FragmentPackageImport,
  DiagnosticCode.HybridPackageDiscouraged,
]);

export function defaultSeverityForCode(code: DiagnosticCode): DiagnosticSeverity {
  return diagnosticWarningCodes.has(code)
    ? DiagnosticSeverity.Warning
    : DiagnosticSeverity.Error;
}
