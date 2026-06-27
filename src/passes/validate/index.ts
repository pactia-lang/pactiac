/**
 * Phase 8 — validate tag body fields against registry def field specs.
 *
 * Walks the bound tree after macro expansion. For every BoundTagNode:
 *   1. Checks all required fields from the registry def are present.
 *   2. Warns on fields not declared in required + optional (openExtension bypasses).
 *   3. Flags duplicate field names within a single tag body.
 *
 * Placement is already enforced in the bind phase (PLACEMENT_VIOLATION).
 * No tag-name-specific checks — all tags use the same uniform validation path.
 */

import {
  BoundNodeKind,
  DiagnosticCode,
  createDiagnostic,
  type BoundBlockNode,
  type BoundTagNode,
  type BoundTree,
  type BoundTreeItem,
} from "../../domain/index.js";
import type { Diagnostic } from "../../domain/diagnostics.js";
import { SyntaxNodeKind, type FieldLineNode } from "../../domain/syntax-tree.js";

export const passName = "validate" as const;

export interface ValidateBoundTreeResult {
  readonly diagnostics: readonly Diagnostic[];
}

export function validateBoundTree(tree: BoundTree): ValidateBoundTreeResult {
  const diagnostics: Diagnostic[] = [];
  walkBoundBlock(tree.root, diagnostics);
  return { diagnostics };
}

function walkBoundBlock(block: BoundBlockNode, diagnostics: Diagnostic[]): void {
  for (const child of block.children) {
    walkBoundItem(child, diagnostics);
  }
}

function walkBoundItem(item: BoundTreeItem, diagnostics: Diagnostic[]): void {
  if (item.kind === BoundNodeKind.BoundBlock) {
    walkBoundBlock(item, diagnostics);
    return;
  }
  if (item.kind === BoundNodeKind.BoundTag) {
    validateTagFields(item, diagnostics);
    // Also recurse into nested tag children
    for (const child of item.children) {
      if (
        child.kind === BoundNodeKind.BoundBlock ||
        child.kind === BoundNodeKind.BoundTag
      ) {
        walkBoundItem(child, diagnostics);
      }
    }
    return;
  }
  // BoundMacroNode, BoundDefNode, BoundContextNode — nothing to validate here.
  // FieldLineNode, ProseNode, ModuleConstNode, ContextBlockNode — leaves.
}

function collectFieldNames(
  items: readonly BoundTreeItem[],
): { names: string[]; locations: Map<string, number> } {
  const names: string[] = [];
  const locations = new Map<string, number>();
  for (const item of items) {
    if (item.kind === SyntaxNodeKind.FieldLine) {
      const field = item as FieldLineNode;
      names.push(field.name);
      if (!locations.has(field.name)) {
        locations.set(field.name, field.location.line);
      }
    }
  }
  return { names, locations };
}

function validateTagFields(
  tag: BoundTagNode,
  diagnostics: Diagnostic[],
): void {
  // Modifier tags (@@name) merge into the next host — they are not standalone.
  if (tag.registryEntry.modifier) return;

  const spec = tag.registryEntry.fields;
  const { names, locations } = collectFieldNames(tag.children);

  // 1. Check required fields present
  for (const required of spec.required) {
    if (!names.includes(required)) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCode.TagBodyMissingField,
          `@${tag.tagName} is missing required field '${required}'`,
          { location: tag.location },
        ),
      );
    }
  }

  // 2. Check unknown fields (skip if openExtension)
  if (!spec.openExtension) {
    const known = new Set([...spec.required, ...spec.optional]);
    for (const name of names) {
      if (!known.has(name)) {
        diagnostics.push(
          createDiagnostic(
            DiagnosticCode.TagBodyUnknownField,
            `@${tag.tagName} has unknown field '${name}'`,
            { location: tag.location },
          ),
        );
      }
    }
  }

  // 3. Check duplicate field names
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      diagnostics.push(
        createDiagnostic(
          DiagnosticCode.ClauseDuplicateKey,
          `@${tag.tagName} has duplicate field '${name}'`,
          { location: tag.location },
        ),
      );
    }
    seen.add(name);
  }
}
