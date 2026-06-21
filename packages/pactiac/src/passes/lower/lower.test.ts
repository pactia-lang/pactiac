import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { IrFile } from "../../domain/ir-file.js";
import { IrMerge } from "../../domain/ir-merge.js";
import { RegistryEntryKind } from "../../domain/registry.js";
import { parseIrPath, primaryModifierField } from "./ir-slot-writer.js";
import { lowerBoundTree } from "./lower-bound-tree.js";
import { bindSyntaxTree } from "../bind/bind-syntax-tree.js";
import { expandBoundTree } from "../expand-macros/expand-bound-tree.js";
import { parseSyntaxTree } from "../parse/recursive-descent-parser.js";
import { registryEntriesFromProgram } from "../registry/build-effective-registry.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const testIrPackage = join(repoRoot, "test/fixtures/packages/@pactia--test-ir@1.0.0");

function testIrRegistry() {
  const indexSource = readFileSync(join(testIrPackage, "index.pactia"), "utf8");
  const manifestSource = readFileSync(join(testIrPackage, "pactia.package.json"), "utf8");
  const program = parseSyntaxTree({ source: indexSource, entryFile: "index.pactia" }).root;
  const parsed = registryEntriesFromProgram(program, "@pactia/test-ir", manifestSource);
  return {
    tags: new Map(parsed.tags.map((entry) => [entry.name, entry])),
    macros: new Map(parsed.macros.map((entry) => [entry.name, entry])),
  };
}

function compileThroughLower(source: string) {
  const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
  const registry = testIrRegistry();
  const bound = bindSyntaxTree(syntax, registry);
  const expanded = expandBoundTree(bound.tree, registry);
  const lowered = lowerBoundTree({
    tree: expanded.tree,
    pactiaVersion: syntax.version,
    entryFile: "product.pactia",
  });
  return { syntax, registry, bound, expanded, lowered };
}

describe("ir-slot-writer", () => {
  it("parses array ir paths", () => {
    assert.deepEqual(parseIrPath("endpoints[]"), {
      containerPath: "endpoints",
      appendArray: true,
    });
    assert.deepEqual(parseIrPath("response"), {
      containerPath: "response",
      appendArray: false,
    });
  });

  it("selects primary modifier field from registry entry", () => {
    const entry = {
      kind: RegistryEntryKind.Tag as const,
      name: "output",
      source: "@pactia/test-ir",
      in: [],
      fields: { required: ["bodyRef"], optional: [], modifier: true, openExtension: false },
      modifier: true,
      ir: { file: IrFile.Service, path: "response", merge: IrMerge.MergeIntoHost },
    };
    assert.equal(primaryModifierField(entry), "bodyRef");
  });
});

describe("lowerBoundTree", () => {
  it("lowers @output prefix and @api append_host into service endpoints", () => {
    const source = `pactia 1.0
import @pactia/test-ir;

product Demo {
  module billing {
    service OrderService {
      @output OrderResponse
      @api create_order {
        method: POST,
        path: "/api/v1/orders",
        > Creates an order
      }
    }
  }
}`;

    const { lowered } = compileThroughLower(source);
    assert.equal(lowered.diagnostics.length, 0);

    const serviceJson = lowered.files.get("input/modules/billing/services/order.service.json");
    assert.ok(serviceJson);
    const parsed = JSON.parse(serviceJson!) as {
      service: {
        name: string;
        endpoints: Array<Record<string, unknown>>;
      };
    };

    assert.equal(parsed.service.name, "OrderService");
    assert.equal(parsed.service.endpoints.length, 1);
    const endpoint = parsed.service.endpoints[0]!;
    assert.equal(endpoint["id"], "create_order");
    assert.equal(endpoint["method"], "POST");
    assert.equal(endpoint["path"], "/api/v1/orders");
    assert.deepEqual(endpoint["response"], { bodyRef: "OrderResponse" });
    assert.equal(endpoint["provenance"], "Pactia");
  });

  it("emits manifest and product JSON alongside service IR", () => {
    const source = `pactia 1.0
import @pactia/test-ir;

product Demo {
  module billing {
    service OrderService {
      @api ping {
        method: GET,
        path: "/ping",
      }
    }
  }
}`;

    const { lowered } = compileThroughLower(source);
    assert.equal(lowered.diagnostics.length, 0);
    assert.ok(lowered.files.get("input/manifest.json"));
    assert.ok(lowered.files.get("input/product.json"));
    const manifest = JSON.parse(lowered.files.get("input/manifest.json")!) as {
      manifest: { modules: Array<{ name: string }> };
    };
    assert.equal(manifest.manifest.modules[0]?.name, "billing");
  });
});
