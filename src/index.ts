export { compile, compileWorkspace, assembleWorkspace } from "./compile/compile.js";
export type { CompileResult } from "./compile/compile.js";
export { compileSource } from "./application/compile-source.js";
export { extractScenarios } from "./frontend/scenarios/extract-tests.js";
export { detectPactiaVersion } from "./compile/version.js";
export { lowerScenarios } from "./frontend/scenarios/lower.js";
export { parseWhenClause, parseThenClause } from "./frontend/scenarios/clauses.js";
export { emitJson } from "./adapters/json-emitter.js";
export { Provenance } from "./diagnostics/diagnostic.js";
export type { Diagnostic as ProvenanceGapReport } from "./diagnostics/diagnostic.js";
export { tokenize, TokenType, PactiaSyntaxError } from "./frontend/lexer/tokens.js";
export type { Token } from "./frontend/lexer/tokens.js";
export type { ScenarioDecl, ScenarioStep } from "./frontend/scenarios/types.js";

/** v2 clean architecture — domain, ports, application, passes. */
export * from "./domain/index.js";
export * from "./ports/index.js";
export * from "./application/index.js";
export * from "./passes/index.js";
export { AdapterKind, adapterKinds } from "./adapters/index.js";
