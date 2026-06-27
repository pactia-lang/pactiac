export {
  CompilePhase,
  compilePhaseLabel,
  compilePhaseOrder,
} from "./compile-phase.js";
export {
  DiagnosticCode,
  DiagnosticSeverity,
  defaultSeverityForCode,
  diagnosticWarningCodes,
} from "./diagnostic-code.js";
export {
  createDiagnostic,
  hasErrors,
  mergeDiagnostics,
} from "./diagnostics.js";
export type { Diagnostic, DiagnosticBag, ProvenanceGap } from "./diagnostics.js";
export { IrBodyKind, IrBodySlot, IrContextSlot } from "./ir-body.js";
export { IrFile, irFileForPlacement, irFileValues, parseIrFile } from "./ir-file.js";
export { IrMerge, irMergeValues, parseIrMerge } from "./ir-merge.js";
export {
  allPlacementTargets,
  parsePlacementTarget,
  placementAllows,
  placementTargetValues,
  PlacementTarget,
} from "./placement.js";
export { Provenance, provenanceValues } from "./provenance.js";
export {
  RegistryEntryKind,
  RegistryPrecedenceTier,
  isRegistryMacroEntry,
  isRegistryTagEntry,
  registryPrecedenceOrder,
} from "./registry.js";
export type {
  DefBodyAst,
  EffectiveRegistry,
  FieldSpec,
  IrSlot,
  RegistryEntry,
  RegistryMacroEntry,
  RegistryTagEntry,
  PackageContextExport,
} from "./registry.js";
export {
  BoundNodeKind,
  boundNodeLocation,
} from "./bound-tree.js";
export type {
  BoundBlockNode,
  BoundContextNode,
  BoundDefNode,
  BoundMacroNode,
  BoundNode,
  BoundTagNode,
  BoundTree,
  BoundTreeItem,
} from "./bound-tree.js";
export {
  IrOutputRoot,
  IrRelativePath,
  moduleIrPaths,
  serviceIrPath,
} from "./workspace-ir.js";
export type { WorkspaceIr, WorkspaceIrFiles } from "./workspace-ir.js";
export {
  DefSigil,
  SyntaxNodeKind,
  collectLocalDefs,
  programModules,
} from "./syntax-tree.js";
export type {
  DefDeclNode,
  FieldLineNode,
  ImportNode,
  MacroInvocationNode,
  ModelNode,
  ModuleConstNode,
  ModuleNode,
  PackageConstNode,
  ProductNode,
  ProgramNode,
  ProseNode,
  ServiceNode,
  SourceLocation,
  SourceSpan,
  SyntaxTree,
  TagBlockNode,
  TagBodyItem,
  TagPrefixNode,
} from "./syntax-tree.js";
