import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { repoRoot } from "../../../test/fixture-paths.js";
import { parseSyntaxTree } from "./recursive-descent-parser.js";
import { PactiaSyntaxError } from "../../frontend/lexer/tokens.js";
import { SyntaxNodeKind } from "../../domain/syntax-tree.js";

const relaySource = readFileSync(
  join(repoRoot, "test/fixtures/kernel/relay.pactia"),
  "utf8",
);

describe("RecursiveDescentParser", () => {
  it("parses relay product imports and module structure", () => {
    const tree = parseSyntaxTree({
      source: relaySource,
      entryFile: "product.pactia",
    });
    assert.equal(tree.version, "1.0");
    assert.deepEqual(
      tree.root.imports.map((node) => node.path),
      ["@pactia/kernel", "@pactia/rust-stack"],
    );
    assert.equal(tree.root.product?.name, "Relay");
    const modules =
      tree.root.product?.items.filter(
        (item) => item.kind === SyntaxNodeKind.Module,
      ) ?? [];
    assert.equal(modules.length, 1);
    assert.equal(modules[0]?.name, "orders");
  });

  it("parses service endpoints inside relay module", () => {
    const tree = parseSyntaxTree({
      source: relaySource,
      entryFile: "product.pactia",
    });
    const ordersModule = tree.root.product?.items.find(
      (item) => item.kind === SyntaxNodeKind.Module,
    );
    assert.ok(ordersModule && ordersModule.kind === SyntaxNodeKind.Module);
    const orderService = ordersModule.items.find(
      (item) => item.kind === SyntaxNodeKind.Service,
    );
    assert.ok(orderService && orderService.kind === SyntaxNodeKind.Service);
    assert.equal(orderService.name, "OrderService");
    const apiTags = orderService.items.filter(
      (item) => item.kind === SyntaxNodeKind.TagBlock && item.tagName === "api",
    );
    assert.equal(apiTags.length, 2);
  });
});

describe("package index defs", () => {
  it("parses export def # macros from index.pactia", () => {
    const indexSource = readFileSync(
      join(
        repoRoot,
        "test/fixtures/packages/@pactia--rust-stack@1.0.0/index.pactia",
      ),
      "utf8",
    );
    const tree = parseSyntaxTree({
      source: indexSource,
      entryFile: "index.pactia",
    });
    assert.equal(tree.root.exportDefs.length, 4);
    assert.deepEqual(
      tree.root.exportDefs.map((def) => def.name),
      ["rust-stack", "paginated", "list", "detail"],
    );
  });
});

describe("package constant exports", () => {
  it("parses export def name = value in index.pactia", () => {
    const source = [
      "pactia 1.0",
      "export def max_page = 100",
      "export def default_timeout = 30",
      "export def hint = > Validate all inputs.",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "index.pactia" });
    assert.equal(tree.root.constantExports.length, 3);
    assert.equal(tree.root.constantExports[0]?.name, "max_page");
    assert.equal(tree.root.constantExports[0]?.value, "100");
    assert.equal(tree.root.constantExports[1]?.name, "default_timeout");
    assert.equal(tree.root.constantExports[1]?.value, "30");
    assert.equal(tree.root.constantExports[2]?.name, "hint");
    assert.equal(tree.root.constantExports[2]?.value, "Validate all inputs.");
  });

  it("parses export name = value without def (bare)", () => {
    const source = [
      "pactia 1.0",
      "export max_page = 100",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "index.pactia" });
    // Parsed into constantExports; CONSTANT_DEF_REQUIRED diagnostic handled in bind pass
    assert.equal(tree.root.constantExports.length, 1);
    assert.equal(tree.root.constantExports[0]?.name, "max_page");
    assert.equal(tree.root.constantExports[0]?.value, "100");
  });

  it("constantExports is empty for product.pactia with no export def =", () => {
    const source = [
      "pactia 1.0",
      "product X { }",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "product.pactia" });
    assert.deepEqual(tree.root.constantExports, []);
  });

  it("rejects export def = with block keywords as constant names", () => {
    assert.throws(
      () => parseSyntaxTree({
        source: "pactia 1.0\nexport def module = foo\n",
        entryFile: "index.pactia",
      }),
      PactiaSyntaxError,
    );
  });

  it("rejects export def module as TOPOLOGY_DEF_FORBIDDEN", () => {
    assert.throws(
      () => parseSyntaxTree({
        source: "pactia 1.0\nexport def module\n",
        entryFile: "index.pactia",
      }),
      /TOPOLOGY_DEF_FORBIDDEN/,
    );
  });

  it("rejects export def service as TOPOLOGY_DEF_FORBIDDEN", () => {
    assert.throws(
      () => parseSyntaxTree({
        source: "pactia 1.0\nexport def service\n",
        entryFile: "index.pactia",
      }),
      /TOPOLOGY_DEF_FORBIDDEN/,
    );
  });

  it("rejects multiple root topology exports as TOPOLOGY_MULTIPLE_ROOT_EXPORTS", () => {
    assert.throws(
      () => parseSyntaxTree({
        source: "pactia 1.0\nexport module orders { }\nexport service OrderService { }\n",
        entryFile: "orders.module.pactia",
      }),
      /TOPOLOGY_MULTIPLE_ROOT_EXPORTS/,
    );
  });

  it("rejects inline topology with manifest as TOPOLOGY_MANIFEST_INLINE_EXPORT", () => {
    assert.throws(
      () => parseSyntaxTree({
        source: 'pactia 1.0\nexport "./mod.pactia"\nexport module orders { }\n',
        entryFile: "index.pactia",
      }),
      /TOPOLOGY_MANIFEST_INLINE_EXPORT/,
    );
  });

  it("rejects nested export inside module as TOPOLOGY_NESTED_EXPORT", () => {
    assert.throws(
      () => parseSyntaxTree({
        source: "pactia 1.0\nexport module orders {\n  export service OrderService { }\n}\n",
        entryFile: "orders.module.pactia",
      }),
      /TOPOLOGY_NESTED_EXPORT/,
    );
  });

  it("rejects nested export inside service as TOPOLOGY_NESTED_EXPORT", () => {
    assert.throws(
      () => parseSyntaxTree({
        source: "pactia 1.0\nexport service OrderService {\n  export model order_model { }\n}\n",
        entryFile: "order.service.pactia",
      }),
      /TOPOLOGY_NESTED_EXPORT/,
    );
  });
});

describe("fragment exports", () => {
  it("parses export module, service, and model at program root", () => {
    const moduleSource = readFileSync(
      join(
        repoRoot,
        "test/fixtures/workspace/relay/fragments/orders.module.pactia",
      ),
      "utf8",
    );
    const moduleTree = parseSyntaxTree({
      source: moduleSource,
      entryFile: "orders.module.pactia",
    });
    assert.equal(moduleTree.root.fragmentExports.length, 1);
    assert.equal(moduleTree.root.fragmentExports[0]?.name, "orders");

    const serviceSource = readFileSync(
      join(
        repoRoot,
        "test/fixtures/workspace/relay/fragments/order.service.pactia",
      ),
      "utf8",
    );
    const serviceTree = parseSyntaxTree({
      source: serviceSource,
      entryFile: "order.service.pactia",
    });
    assert.equal(serviceTree.root.fragmentServiceExports.length, 1);
    assert.equal(
      serviceTree.root.fragmentServiceExports[0]?.name,
      "OrderService",
    );

    const modelSource = readFileSync(
      join(
        repoRoot,
        "test/fixtures/workspace/relay/fragments/orders.model.pactia",
      ),
      "utf8",
    );
    const modelTree = parseSyntaxTree({
      source: modelSource,
      entryFile: "orders.model.pactia",
    });
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

  it("parses import with `as` alias for tag", () => {
    const source = [
      "pactia 1.0",
      "import { @api as @endpoint } from @pactia/kernel;",
      "product Demo {",
      "}",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const imp = tree.root.imports[0]!;
    assert.deepEqual(imp.symbols, ["@api"]);
    assert.ok(imp.aliases);
    assert.equal(imp.aliases?.get("@endpoint"), "@api");
  });

  it("parses import with `as` alias for macro", () => {
    const source = [
      "pactia 1.0",
      "import { #list as #collection } from @pactia/kernel;",
      "product Demo {",
      "}",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const imp = tree.root.imports[0]!;
    assert.deepEqual(imp.symbols, ["#list"]);
    assert.equal(imp.aliases?.get("#collection"), "#list");
  });

  it("parses import with `as` alias for constant", () => {
    const source = [
      "pactia 1.0",
      "import { max_page as page_limit } from @pactia/kernel;",
      "product Demo {",
      "}",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const imp = tree.root.imports[0]!;
    assert.deepEqual(imp.symbols, ["max_page"]);
    assert.equal(imp.aliases?.get("page_limit"), "max_page");
  });

  it("parses import with mixed aliased and non-aliased symbols", () => {
    const source = [
      "pactia 1.0",
      "import { @api, #list as #collection, max_page } from @pactia/kernel;",
      "product Demo {",
      "}",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const imp = tree.root.imports[0]!;
    assert.deepEqual(imp.symbols, ["@api", "#list", "max_page"]);
    assert.equal(imp.aliases?.get("#collection"), "#list");
    assert.equal(imp.aliases?.size, 1); // only #list has alias
  });

  it("rejects import alias with sigil mismatch", () => {
    const source = [
      "pactia 1.0",
      "import { @api as #endpoint } from @pactia/kernel;",
      "product Demo {",
      "}",
    ].join("\n");
    assert.throws(
      () => parseSyntaxTree({ source, entryFile: "product.pactia" }),
      /sigil mismatch/,
    );
  });

  it("rejects import alias: macro aliased as tag", () => {
    const source = [
      "pactia 1.0",
      "import { #list as @collection } from @pactia/kernel;",
      "product Demo {",
      "}",
    ].join("\n");
    assert.throws(
      () => parseSyntaxTree({ source, entryFile: "product.pactia" }),
      /sigil mismatch/,
    );
  });

  it("parses import without `as` still works unchanged", () => {
    const source = [
      "pactia 1.0",
      "import { @api, @@output, #list, max_page } from @pactia/kernel;",
      "product Demo {",
      "}",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const imp = tree.root.imports[0]!;
    assert.deepEqual(imp.symbols, ["@api", "@@output", "#list", "max_page"]);
    assert.equal(imp.aliases, undefined);
  });

  it("parses import with wildcard *", () => {
    const source = [
      "pactia 1.0",
      "import { *, @api } from @pactia/kernel;",
      "product Demo {",
      "}",
    ].join("\n");
    const tree = parseSyntaxTree({ source, entryFile: "product.pactia" });
    assert.deepEqual(tree.root.imports[0]?.symbols, ["*", "@api"]);
  });
});
