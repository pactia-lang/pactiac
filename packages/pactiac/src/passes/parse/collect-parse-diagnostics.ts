import { DiagnosticCode, createDiagnostic, type Diagnostic } from "../../domain/index.js";
import {
  SyntaxNodeKind,
  type MacroInvocationNode,
  type ModelNode,
  type ModuleNode,
  type ProductNode,
  type ProgramNode,
  type ServiceNode,
  type SyntaxTree,
  type TagBodyItem,
} from "../../domain/syntax-tree.js";

function walkTagBodyItems(items: readonly TagBodyItem[], visitMacro: (node: MacroInvocationNode) => void): void {
  for (const item of items) {
    if (item.kind === SyntaxNodeKind.MacroInvocation) {
      visitMacro(item);
      continue;
    }
    if (item.kind === SyntaxNodeKind.TagBlock) {
      walkTagBodyItems(item.items, visitMacro);
    }
  }
}

function walkModule(module: ModuleNode, visitMacro: (node: MacroInvocationNode) => void): void {
  for (const item of module.items) {
    if (item.kind === SyntaxNodeKind.Service) walkService(item, visitMacro);
    else if (item.kind === SyntaxNodeKind.Model) walkModel(item, visitMacro);
    else if (item.kind === SyntaxNodeKind.TagBlock || item.kind === SyntaxNodeKind.TagPrefix) {
      if (item.kind === SyntaxNodeKind.TagBlock) walkTagBodyItems(item.items, visitMacro);
    } else if (item.kind === SyntaxNodeKind.MacroInvocation) {
      visitMacro(item);
    }
  }
}

function walkService(service: ServiceNode, visitMacro: (node: MacroInvocationNode) => void): void {
  for (const item of service.items) {
    if (item.kind === SyntaxNodeKind.ModuleConst) continue;
    if (item.kind === SyntaxNodeKind.MacroInvocation) {
      visitMacro(item);
      continue;
    }
    if (item.kind === SyntaxNodeKind.TagBlock) {
      walkTagBodyItems(item.items, visitMacro);
    }
  }
}

function walkModel(model: ModelNode, visitMacro: (node: MacroInvocationNode) => void): void {
  walkTagBodyItems(model.items, visitMacro);
}

function walkProduct(product: ProductNode, visitMacro: (node: MacroInvocationNode) => void): void {
  for (const item of product.items) {
    if (item.kind === SyntaxNodeKind.Module) walkModule(item, visitMacro);
    else if (item.kind === SyntaxNodeKind.MacroInvocation) visitMacro(item);
    else if (item.kind === SyntaxNodeKind.TagBlock) walkTagBodyItems(item.items, visitMacro);
  }
}

function walkProgram(program: ProgramNode, visitMacro: (node: MacroInvocationNode) => void): void {
  if (program.product) walkProduct(program.product, visitMacro);
  for (const module of program.fragmentExports) walkModule(module, visitMacro);
  for (const service of program.fragmentServiceExports) walkService(service, visitMacro);
  for (const model of program.fragmentModelExports) walkModel(model, visitMacro);
}

export function collectLegacyMacroDiagnostics(tree: SyntaxTree): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  walkProgram(tree.root, (macro) => {
    if (!macro.legacyBracketed) return;
    diagnostics.push(
      createDiagnostic(
        DiagnosticCode.LegacyMacroSyntax,
        `Legacy macro syntax '#[${macro.name}]' — use '#${macro.name}' per Pactia 1.2`,
        { location: macro.location },
      ),
    );
  });

  return diagnostics;
}
