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
  LegacyMacroSyntax = "LEGACY_MACRO_SYNTAX",

  // Tag bodies
  TagBodyMissingField = "TAG_BODY_MISSING_FIELD",
  TagBodyUnknownField = "TAG_BODY_UNKNOWN_FIELD",
  TagBodyInvalid = "TAG_BODY_INVALID",
  ClauseDuplicateKey = "CLAUSE_DUPLICATE_KEY",

  // State graphs
  StateBindingInvalid = "STATE_BINDING_INVALID",
  StateDuplicateTransition = "STATE_DUPLICATE_TRANSITION",
  StateTransitionUndefined = "STATE_TRANSITION_UNDEFINED",

  // Package resolution
  PackageNotFound = "PACKAGE_NOT_FOUND",
  PackageLockMismatch = "PACKAGE_LOCK_MISMATCH",
  LockEntryMissing = "LOCK_ENTRY_MISSING",
  StackBindingMismatch = "STACK_BINDING_MISMATCH",

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
}

export enum DiagnosticSeverity {
  Error = "error",
  Warning = "warning",
}

/** Codes that represent warnings rather than hard errors. */
export const diagnosticWarningCodes: ReadonlySet<DiagnosticCode> = new Set([
  DiagnosticCode.TagBodyUnknownField,
  DiagnosticCode.LegacyMacroSyntax,
  DiagnosticCode.ImportUnused,
]);

export function defaultSeverityForCode(code: DiagnosticCode): DiagnosticSeverity {
  return diagnosticWarningCodes.has(code)
    ? DiagnosticSeverity.Warning
    : DiagnosticSeverity.Error;
}
