import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { repoRoot } from "../../../test/fixture-paths.js";
import {
  BoundNodeKind,
  DiagnosticCode,
  PlacementTarget,
  RegistryEntryKind,
} from "../../domain/index.js";
import { loadRegistryFromWorkspace } from "../../adapters/fs-registry-loader.js";
import { parseSyntaxTree } from "../parse/recursive-descent-parser.js";
import { SyntaxNodeKind } from "../../domain/syntax-tree.js";
import { bindSyntaxTree } from "./bind-syntax-tree.js";
import type {
  BoundBlockNode,
  BoundMacroNode,
} from "../../domain/bound-tree.js";

const relayWorkspace = join(repoRoot, "test/fixtures/workspace/relay");
const relaySource = readFileSync(
  join(repoRoot, "test/fixtures/kernel/relay.pactia"),
  "utf8",
);

function findBoundMacros(node: BoundBlockNode): BoundMacroNode[] {
  const macros: BoundMacroNode[] = [];
  for (const child of node.children) {
    if (child.kind === BoundNodeKind.BoundMacro) macros.push(child);
    if (child.kind === BoundNodeKind.BoundBlock)
      macros.push(...findBoundMacros(child));
    if (child.kind === BoundNodeKind.BoundTag) {
      for (const nested of child.children) {
        if (nested.kind === BoundNodeKind.BoundMacro) macros.push(nested);
      }
    }
  }
  return macros;
}

describe("bindSyntaxTree", () => {
  it("binds stack macros from effective registry", () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(
      repoRoot,
      "test/fixtures/packages",
    );
    try {
      const syntax = parseSyntaxTree({
        source: relaySource,
        entryFile: "product.pactia",
      });
      const registry = loadRegistryFromWorkspace(relayWorkspace, syntax);
      const { tree, diagnostics } = bindSyntaxTree(syntax, registry);

      assert.equal(tree.root.placement, PlacementTarget.Product);
      assert.equal(tree.root.hostName, "Relay");

      const ordersModule = tree.root.children.find(
        (child) =>
          child.kind === BoundNodeKind.BoundBlock &&
          child.hostName === "orders",
      );
      assert.ok(ordersModule && ordersModule.kind === BoundNodeKind.BoundBlock);
      assert.equal(ordersModule.placement, PlacementTarget.Module);

      const orderService = ordersModule.children.find(
        (child) =>
          child.kind === BoundNodeKind.BoundBlock &&
          child.hostName === "OrderService",
      );
      assert.ok(orderService && orderService.kind === BoundNodeKind.BoundBlock);
      assert.equal(orderService.placement, PlacementTarget.Service);

      const boundMacros = findBoundMacros(tree.root);
      const listMacro = boundMacros.find((macro) => macro.name === "list");
      assert.ok(listMacro);
      assert.equal(listMacro.registryEntry.source, "@pactia/rust-stack");
      assert.equal(listMacro.enclosing, PlacementTarget.Service);
      assert.equal(listMacro.registryEntry.kind, RegistryEntryKind.Macro);
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });

  it("reports DEF_IN_PRODUCT for export def in consumer product", () => {
    const source = `pactia 1.0
export def #helper in service { }
product X { module m { service S { } } }`;
    const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const registry = { tags: new Map(), macros: new Map() };
    const { diagnostics } = bindSyntaxTree(syntax, registry);
    assert.ok(diagnostics.some((d) => d.code === DiagnosticCode.DefInProduct));
  });

  it("allows export def in package index.pactia", () => {
    const source = readFileSync(
      join(
        repoRoot,
        "test/fixtures/packages/@pactia--rust-stack@1.0.0/index.pactia",
      ),
      "utf8",
    );
    const syntax = parseSyntaxTree({ source, entryFile: "index.pactia" });
    const registry = { tags: new Map(), macros: new Map() };
    const { diagnostics, tree } = bindSyntaxTree(syntax, registry);
    assert.equal(
      diagnostics.filter((d) => d.code === DiagnosticCode.DefInProduct).length,
      0,
    );
    assert.equal(tree.root.children.length, 0);
    assert.equal(syntax.root.exportDefs.length, 4);
    assert.equal(syntax.root.exportDefs[0]?.kind, SyntaxNodeKind.DefExport);
    assert.equal(syntax.root.exportDefs[0]?.name, "rust-stack");
  });

  it("emits MACRO_UNKNOWN for unresolved macro invocations", () => {
    const source = `pactia 1.0
product X { module m { service S { #[missing_macro] } } }`;
    const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const { diagnostics } = bindSyntaxTree(syntax, {
      tags: new Map(),
      macros: new Map(),
    });
    assert.ok(diagnostics.some((d) => d.code === DiagnosticCode.MacroUnknown));
  });

  it("binds local module defs to registry entries", () => {
    const source = `pactia 1.0
product X {
  module m {
    def #local_macro in service { }
    service S { #[local_macro] }
  }
}`;
    const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const localMacro = {
      kind: RegistryEntryKind.Macro as const,
      name: "local_macro",
      source: "local",
      in: [PlacementTarget.Service],
      params: [],
      body: { lines: [] },
    };
    const registry = {
      tags: new Map(),
      macros: new Map([["local_macro", localMacro]]),
    };
    const { tree, diagnostics } = bindSyntaxTree(syntax, registry);
    assert.equal(diagnostics.length, 0);

    const moduleBlock = tree.root.children.find(
      (child) =>
        child.kind === BoundNodeKind.BoundBlock && child.hostName === "m",
    );
    assert.ok(moduleBlock && moduleBlock.kind === BoundNodeKind.BoundBlock);
    const localDef = moduleBlock.children.find(
      (child) => child.kind === BoundNodeKind.BoundDef,
    );
    assert.ok(localDef && localDef.kind === BoundNodeKind.BoundDef);
    assert.equal(localDef.name, "local_macro");
    assert.equal(localDef.registryEntry.source, "local");
  });
});
