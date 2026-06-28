import { compilePhaseOrder, CompilePhase } from "../domain/compile-phase.js";
import { DiagnosticCode, createDiagnostic, hasErrors } from "../domain/index.js";
import { detectPactiaVersion } from "../compile/version.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lockfileDigest } from "../resolve/manifest.js";
import { bindSyntaxTree } from "../passes/bind/bind-syntax-tree.js";
import { expandBoundTree } from "../passes/expand-macros/expand-bound-tree.js";
import { validateBoundTree } from "../passes/validate/index.js";
import { lowerBoundTree } from "../passes/lower/lower-bound-tree.js";

import {
  applyConstantSubstitution,
  importedConstantsFromProgram,
} from "../passes/parse/apply-constant-substitution.js";
import { collectImportUnusedDiagnostics } from "../passes/workspace/workspace-diagnostics.js";
import type {
  CompileContext,
  CompilePipelineOptions,
  CompilePipelineResult,
} from "./compile-context.js";

function assertSupportedVersion(source: string): readonly ReturnType<typeof createDiagnostic>[] {
  const version = detectPactiaVersion(source);
  if (version !== "1.0" && !version.startsWith("1.0.")) {
    return [
      createDiagnostic(
        DiagnosticCode.UnsupportedVersion,
        `Unsupported pactia version: ${version}. Expected pactia 1.0`,
      ),
    ];
  }
  return [];
}

/**
 * v2 compile orchestrator — wires phases 0–12 per spec/docs/compilation.md.
 */
export class CompilePipeline {
  constructor(private readonly options: CompilePipelineOptions) {}

  static readonly phases = compilePhaseOrder;

  run(context: CompileContext): CompilePipelineResult {
    const stopAfter = this.options.stopAfterPhase ?? CompilePhase.Emit;
    const diagnostics: ReturnType<typeof createDiagnostic>[] = [];
    const emptyRegistry: CompilePipelineResult["registry"] = {
      tags: new Map(),
      macros: new Map(),
      contexts: new Map(),
      constants: new Map(),
      structuralExports: new Map(),
    };

    diagnostics.push(...assertSupportedVersion(context.source));
    if (diagnostics.length > 0) {
      return { files: new Map(), diagnostics, provenanceGaps: [], registry: emptyRegistry };
    }

    if (stopAfter < CompilePhase.Parse) {
      return { files: new Map(), diagnostics, provenanceGaps: [], registry: emptyRegistry };
    }

    let syntax: CompilePipelineResult["syntax"];
    try {
      syntax = this.options.ports.parser.parse({
        source: context.source,
        entryFile: context.entryFile,
      });
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCode.ParseError,
          error instanceof Error ? error.message : "Parse failed",
        ),
      );
      return { files: new Map(), diagnostics, provenanceGaps: [], registry: emptyRegistry };
    }

    diagnostics.push(...collectImportUnusedDiagnostics(context.source, context.entryFile));

    const importConstants = importedConstantsFromProgram(syntax.root, context.workspaceRoot);
    const substituted = applyConstantSubstitution(syntax, importConstants);
    syntax = substituted.tree;
    diagnostics.push(...substituted.diagnostics);

    if (stopAfter < CompilePhase.ResolvePackages) {
      return { files: new Map(), diagnostics, provenanceGaps: [], registry: emptyRegistry, syntax };
    }

    const imports = syntax.root.imports
      .map((node) => node.path)
      .filter((path) => path.startsWith("@"));

    let registry = emptyRegistry;
    const partialImports = new Map<string, readonly string[]>();
    for (const node of syntax.root.imports) {
      if (node.path.startsWith("@") && node.symbols && node.symbols.length > 0) {
        partialImports.set(node.path, node.symbols);
      }
    }
    let expansionRegistry = emptyRegistry;
    try {
      registry = this.options.ports.registryLoader.load({
        workspaceRoot: context.workspaceRoot,
        importCoordinates: imports,
        syntax,
        partialImports,
      });
      expansionRegistry = this.options.ports.registryLoader.load({
        workspaceRoot: context.workspaceRoot,
        importCoordinates: imports,
        syntax,
        partialImports,
        macroExpansion: true,
      });
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCode.PackageNotFound,
          error instanceof Error ? error.message : "Package resolution failed",
        ),
      );
      return { files: new Map(), diagnostics, provenanceGaps: [], registry: emptyRegistry, syntax };
    }

    if (stopAfter < CompilePhase.Bind) {
      return { files: new Map(), diagnostics, provenanceGaps: [], registry, syntax };
    }

    const bindResult = bindSyntaxTree(syntax, registry);
    diagnostics.push(...bindResult.diagnostics);

    if (stopAfter <= CompilePhase.Bind) {
      return {
        files: new Map(),
        diagnostics,
        provenanceGaps: [],
        registry,
        syntax,
        bound: bindResult.tree,
      };
    }

    const expandResult = expandBoundTree(bindResult.tree, registry, expansionRegistry);
    diagnostics.push(...expandResult.diagnostics);
    const bound = expandResult.tree;

    if (stopAfter <= CompilePhase.ExpandMacros) {
      return {
        files: new Map(),
        diagnostics,
        provenanceGaps: [],
        registry,
        syntax,
        bound,
      };
    }

    const validateResult = validateBoundTree(bound);
    diagnostics.push(...validateResult.diagnostics);

    const lockPath = join(context.workspaceRoot, "pactia.lock");
    const lockSource = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : undefined;

    const lowerResult = lowerBoundTree({
      tree: bound,
      pactiaVersion: syntax.version,
      entryFile: context.entryFile,
      lockfileDigest: lockSource ? lockfileDigest(lockSource) : undefined,
    });
    diagnostics.push(...lowerResult.diagnostics);

    const lowered = {
      workspace: lowerResult.workspace,
      files: lowerResult.files,
    };

    if (hasErrors(diagnostics)) {
      return {
        files: new Map(),
        diagnostics,
        provenanceGaps: [],
        registry,
        syntax,
        bound,
        lowered,
      };
    }

    if (stopAfter <= CompilePhase.Lower) {
      return {
        files: lowerResult.files,
        diagnostics,
        provenanceGaps: [],
        registry,
        syntax,
        bound,
        lowered,
      };
    }

    this.options.ports.irEmitter.emit({ workspace: lowered, outputRoot: context.workspaceRoot });

    if (stopAfter <= CompilePhase.Emit) {
      return {
        files: lowerResult.files,
        diagnostics,
        provenanceGaps: [],
        registry,
        syntax,
        bound,
        lowered,
      };
    }

    diagnostics.push(
      createDiagnostic(
        DiagnosticCode.ParseError,
        `pactiac v2 pipeline not yet wired through phase ${stopAfter}`,
      ),
    );
    return { files: lowerResult.files, diagnostics, provenanceGaps: [], registry, syntax, bound, lowered };
  }
}
