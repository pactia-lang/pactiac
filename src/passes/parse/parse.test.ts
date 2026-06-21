import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { repoRoot } from "../../../test/fixture-paths.js";
import { parseSyntaxTree } from "./recursive-descent-parser.js";
import { SyntaxNodeKind } from "../../domain/syntax-tree.js";

const relaySource = readFileSync(join(repoRoot, "test/fixtures/kernel/relay.pactia"), "utf8");

describe("RecursiveDescentParser", () => {
  it("parses relay product imports and module structure", () => {
    const tree = parseSyntaxTree({ source: relaySource, entryFile: "product.pactia" });
    assert.equal(tree.version, "1.0");
    assert.deepEqual(
      tree.root.imports.map((node) => node.path),
      ["@pactia/kernel", "@pactia/rust-anb"],
    );
    assert.equal(tree.root.product?.name, "Relay");
    const modules = tree.root.product?.items.filter((item) => item.kind === SyntaxNodeKind.Module) ?? [];
    assert.equal(modules.length, 1);
    assert.equal(modules[0]?.name, "orders");
  });

  it("parses service endpoints inside relay module", () => {
    const tree = parseSyntaxTree({ source: relaySource, entryFile: "product.pactia" });
    const ordersModule = tree.root.product?.items.find((item) => item.kind === SyntaxNodeKind.Module);
    assert.ok(ordersModule && ordersModule.kind === SyntaxNodeKind.Module);
    const orderService = ordersModule.items.find((item) => item.kind === SyntaxNodeKind.Service);
    assert.ok(orderService && orderService.kind === SyntaxNodeKind.Service);
    assert.equal(orderService.name, "OrderService");
    const apiTags = orderService.items.filter((item) => item.kind === SyntaxNodeKind.TagBlock && item.tagName === "api");
    assert.equal(apiTags.length, 2);
  });
});

describe("package index defs", () => {
  it("parses export def # macros from index.pactia", () => {
    const indexSource = readFileSync(
      join(repoRoot, "test/fixtures/packages/@pactia--rust-anb@1.0.0/index.pactia"),
      "utf8",
    );
    const tree = parseSyntaxTree({ source: indexSource, entryFile: "index.pactia" });
    assert.equal(tree.root.exportDefs.length, 4);
    assert.deepEqual(
      tree.root.exportDefs.map((def) => def.name),
      ["rust_anb", "paginated", "list", "detail"],
    );
  });
});

describe("fragment exports", () => {
  it("parses export module, service, and model at program root", () => {
    const moduleSource = readFileSync(
      join(repoRoot, "test/fixtures/workspace/relay/fragments/orders.module.pactia"),
      "utf8",
    );
    const moduleTree = parseSyntaxTree({ source: moduleSource, entryFile: "orders.module.pactia" });
    assert.equal(moduleTree.root.fragmentExports.length, 1);
    assert.equal(moduleTree.root.fragmentExports[0]?.name, "orders");

    const serviceSource = readFileSync(
      join(repoRoot, "test/fixtures/workspace/relay/fragments/order.service.pactia"),
      "utf8",
    );
    const serviceTree = parseSyntaxTree({ source: serviceSource, entryFile: "order.service.pactia" });
    assert.equal(serviceTree.root.fragmentServiceExports.length, 1);
    assert.equal(serviceTree.root.fragmentServiceExports[0]?.name, "OrderService");

    const modelSource = readFileSync(
      join(repoRoot, "test/fixtures/workspace/relay/fragments/orders.model.pactia"),
      "utf8",
    );
    const modelTree = parseSyntaxTree({ source: modelSource, entryFile: "orders.model.pactia" });
    assert.equal(modelTree.root.fragmentModelExports.length, 1);
    assert.equal(modelTree.root.fragmentModelExports[0]?.name, "orders_model");
  });

  it("parses partial package import symbols including # macros", () => {
    const source = [
      "pactia 1.0",
      "import { @api, #list } from @pactia/kernel;",
      "product Demo {",
      "}",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "product.pactia" });
    assert.deepEqual(tree.root.imports[0]?.symbols, ["@api", "#list"]);
  });
});
