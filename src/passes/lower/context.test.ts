import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bindSyntaxTree } from "../bind/bind-syntax-tree.js";
import { expandBoundTree } from "../expand-macros/expand-bound-tree.js";
import { parseSyntaxTree } from "../parse/recursive-descent-parser.js";
import { lowerBoundTree } from "./lower-bound-tree.js";

const source = `pactia 1.0

product ContextDemo {
  context api_notes {
    path: "./docs/api.md",
    > API notes for reviewers.
  }

  module core {
    service DemoService {
      context ops_pack {
        path: "./docs/ops/",
        > Operations bundle.
      }
    }
  }
}
`;

describe("context lowering", () => {
  it("lowers inline context blocks to context[] on product and service slices", () => {
    const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
    const registry = { tags: new Map(), macros: new Map(), contexts: new Map() };
    const bound = bindSyntaxTree(syntax, registry);
    const expanded = expandBoundTree(bound.tree, registry);
    const lowered = lowerBoundTree({
      tree: expanded.tree,
      pactiaVersion: "1.0",
      entryFile: "product.pactia",
    });

    const productJson = lowered.files.get("input/product.json");
    assert.ok(productJson);
    const product = JSON.parse(productJson) as {
      product: { context?: Array<{ id: string; path: string }> };
    };
    assert.equal(product.product.context?.[0]?.id, "api_notes");
    assert.equal(product.product.context?.[0]?.path, "./docs/api.md");

    const serviceJson = lowered.files.get("input/modules/core/services/demo.service.json");
    assert.ok(serviceJson);
    const service = JSON.parse(serviceJson) as {
      service: { context?: Array<{ id: string; path: string }> };
    };
    assert.equal(service.service.context?.[0]?.id, "ops_pack");
    assert.equal(service.service.context?.[0]?.path, "./docs/ops/");
  });
});
