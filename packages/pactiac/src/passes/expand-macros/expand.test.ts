import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  BoundNodeKind,
  DiagnosticCode,
  PlacementTarget,
  SyntaxNodeKind,
} from "../../domain/index.js";
import { loadRegistryFromWorkspace } from "../../adapters/fs-registry-loader.js";
import type { BoundBlockNode, BoundTreeItem } from "../../domain/bound-tree.js";
import type { FieldLineNode } from "../../domain/syntax-tree.js";
import { bindSyntaxTree } from "../bind/bind-syntax-tree.js";
import { parseSyntaxTree } from "../parse/recursive-descent-parser.js";
import { expandBoundTree } from "./expand-bound-tree.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const relayWorkspace = join(repoRoot, "test/fixtures/workspace/relay");

function findServiceBlock(root: BoundBlockNode, serviceName: string): BoundBlockNode | undefined {
  for (const item of root.children) {
    if (item.kind !== BoundNodeKind.BoundBlock) continue;
    if (item.hostName === serviceName && item.placement === PlacementTarget.Service) return item;
    if (item.placement === PlacementTarget.Module) {
      const nested = findServiceBlock(item, serviceName);
      if (nested) return nested;
    }
  }
  return undefined;
}

function collectFieldLines(items: readonly BoundTreeItem[]): FieldLineNode[] {
  const lines: FieldLineNode[] = [];
  for (const item of items) {
    if (item.kind === SyntaxNodeKind.FieldLine) lines.push(item);
    if (item.kind === BoundNodeKind.BoundBlock) lines.push(...collectFieldLines(item.children));
    if (item.kind === BoundNodeKind.BoundTag) lines.push(...collectFieldLines(item.children));
  }
  return lines;
}

function containsMacro(items: readonly BoundTreeItem[]): boolean {
  return items.some((item) => {
    if (item.kind === BoundNodeKind.BoundMacro) return true;
    if (item.kind === BoundNodeKind.BoundBlock) return containsMacro(item.children);
    if (item.kind === BoundNodeKind.BoundTag) return containsMacro(item.children);
    return false;
  });
}

function bindAndExpand(source: string) {
  const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
  const previous = process.env["PACTIA_VENDOR_ROOT"];
  process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
  try {
    const registry = loadRegistryFromWorkspace(relayWorkspace, syntax);
    const bound = bindSyntaxTree(syntax, registry);
    const expanded = expandBoundTree(bound.tree, registry);
    return {
      ...expanded,
      bindDiagnostics: bound.diagnostics,
      registry,
    };
  } finally {
    if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
    else process.env["PACTIA_VENDOR_ROOT"] = previous;
  }
}

describe("expandBoundTree", () => {
  it("splices #paginated into modifier field lines", () => {
    const source = `pactia 1.0
product X {
  module orders {
    service OrderService {
      #[paginated]
    }
  }
}`;
    const { tree, diagnostics } = bindAndExpand(source);
    assert.equal(diagnostics.length, 0);

    const service = findServiceBlock(tree.root, "OrderService");
    assert.ok(service);
    assert.equal(containsMacro(service.children), false);

    const fields = collectFieldLines(service.children);
    assert.deepEqual(
      fields.map((field) => [field.name, field.value]),
      [
        ["modifiers.pageSize", "50"],
        ["modifiers.paginated", "true"],
      ],
    );
  });

  it("follows nested macro chain list -> paginated", () => {
    const source = `pactia 1.0
product X {
  module orders {
    service OrderService {
      #[list]
    }
  }
}`;
    const { tree, diagnostics } = bindAndExpand(source);
    assert.equal(diagnostics.length, 0);

    const service = findServiceBlock(tree.root, "OrderService");
    assert.ok(service);
    const fields = collectFieldLines(service!.children);
    assert.equal(fields.length, 2);
    assert.equal(fields[0]?.name, "modifiers.pageSize");
    assert.equal(fields[1]?.name, "modifiers.paginated");
  });

  it("substitutes macro parameters in spliced body", () => {
    const source = `pactia 1.0
product X {
  module m {
    def #cursor_paginated(max_page) in service {
      modifiers.pageSize: max_page,
      > Policy row limit
    }
    service S { #[cursor_paginated(100)] }
  }
}`;
    const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const registry = loadRegistryFromWorkspace(relayWorkspace, syntax);
    const bound = bindSyntaxTree(syntax, registry);
    const { tree, diagnostics } = expandBoundTree(bound.tree, registry);
    assert.equal(diagnostics.length, 0);

    const service = findServiceBlock(tree.root, "S");
    assert.ok(service);
    const fields = collectFieldLines(service!.children);
    assert.equal(fields[0]?.value, "100");
    const prose = service!.children.find((item) => item.kind === SyntaxNodeKind.Prose);
    assert.ok(prose && prose.kind === SyntaxNodeKind.Prose);
    assert.equal(prose.text, "Policy row limit");
  });

  it("reports MACRO_ARGS_INVALID for wrong arity", () => {
    const source = `pactia 1.0
product X {
  module m {
    def #needs_one(arg1) in service { modifiers.pageSize: arg1, }
    service S { #[needs_one] }
  }
}`;
    const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const registry = loadRegistryFromWorkspace(relayWorkspace, syntax);
    const bound = bindSyntaxTree(syntax, registry);
    const { diagnostics } = expandBoundTree(bound.tree, registry);
    assert.ok(diagnostics.some((d) => d.code === DiagnosticCode.MacroArgsInvalid));
  });

  it("reports PLACEMENT_VIOLATION when macro used outside in targets", () => {
    const source = `pactia 1.0
product X {
  module m {
    def #service_only in service { modifiers.pageSize: 10, }
    model { #[service_only] }
  }
}`;
    const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const registry = loadRegistryFromWorkspace(relayWorkspace, syntax);
    const bound = bindSyntaxTree(syntax, registry);
    const { diagnostics } = expandBoundTree(bound.tree, registry);
    assert.ok(diagnostics.some((d) => d.code === DiagnosticCode.PlacementViolation));
  });

  it("reports MACRO_EXPANSION_CYCLE for recursive macros", () => {
    const source = `pactia 1.0
product X {
  module m {
    def #a in service { #[b] }
    def #b in service { #[a] }
    service S { #[a] }
  }
}`;
    const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const registry = loadRegistryFromWorkspace(relayWorkspace, syntax);
    const bound = bindSyntaxTree(syntax, registry);
    const { diagnostics } = expandBoundTree(bound.tree, registry);
    assert.ok(diagnostics.some((d) => d.code === DiagnosticCode.MacroExpansionCycle));
  });
});
