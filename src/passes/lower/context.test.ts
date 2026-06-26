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
  it("lowers context keyword to context[] and tags to body[]", () => {
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
      product: {
        body?: Array<{ kind: string }>;
        context?: Array<{ name: string; path: string }>;
      };
    };
    assert.equal(product.product.context?.[0]?.name, "api_notes");
    assert.equal(product.product.context?.[0]?.path, "./docs/api.md");
    assert.equal(product.product.body, undefined);

    const serviceJson = lowered.files.get("input/modules/core/services/demo.service.json");
    assert.ok(serviceJson);
    const service = JSON.parse(serviceJson) as {
      service: {
        body?: unknown[];
        context?: Array<{ name: string; path: string }>;
      };
    };
    assert.equal(service.service.context?.[0]?.name, "ops_pack");
    assert.equal(service.service.context?.[0]?.path, "./docs/ops/");
    assert.equal(service.service.body, undefined);
  });
});
