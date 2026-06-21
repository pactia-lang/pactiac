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
const kernelPackage = join(repoRoot, "test/fixtures/packages/@pactia--kernel@1.0.0");

function registryFromPackage(packageRoot: string, coordinate: string) {
  const indexSource = readFileSync(join(packageRoot, "index.pactia"), "utf8");
  const manifestSource = readFileSync(join(packageRoot, "pactia.package.json"), "utf8");
  const program = parseSyntaxTree({ source: indexSource, entryFile: "index.pactia" }).root;
  const parsed = registryEntriesFromProgram(program, coordinate, manifestSource);
  return {
    tags: new Map(parsed.tags.map((entry) => [entry.name, entry])),
    macros: new Map(parsed.macros.map((entry) => [entry.name, entry])),
  };
}

function testIrRegistry() {
  return registryFromPackage(testIrPackage, "@pactia/test-ir");
}

function kernelRegistry() {
  return registryFromPackage(kernelPackage, "@pactia/kernel");
}

function compileThroughLower(source: string, registry = testIrRegistry()) {
  const syntax = parseSyntaxTree({ source, entryFile: "product.pactia" });
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
    assert.ok(lowered.files.get("input/workspace.json"));
    const workspace = JSON.parse(lowered.files.get("input/workspace.json")!) as {
      manifest: { manifest: { modules: Array<{ name: string }> } };
      product: { product: { name?: string } };
      modules: Array<{ module: { module: { name?: string } } }>;
    };
    assert.equal(workspace.manifest.manifest.modules[0]?.name, "billing");
    assert.equal(workspace.modules[0]?.module.module.name, "billing");
  });

  it("lowers enum hosts from declared registry fields and entity hosts from open fields", () => {
    const source = `pactia 1.0
import @pactia/kernel;

product Demo {
  module billing {
    model {
      @enum Status {
        values: [PENDING, FULFILLED],
      }

      @entity Item {
        id: uuid,
      }
    }
  }
}`;

    const { lowered } = compileThroughLower(source, kernelRegistry());
    assert.equal(lowered.diagnostics.length, 0);

    const modelJson = lowered.files.get("input/modules/billing/billing.model.json");
    assert.ok(modelJson);
    const parsed = JSON.parse(modelJson!) as {
      model: {
        enums: Array<{ name: string; values: string[] }>;
        entities: Array<{ name: string; fields: Array<{ name: string; type: string }> }>;
      };
    };

    assert.equal(parsed.model.enums[0]?.name, "Status");
    assert.deepEqual(parsed.model.enums[0]?.values, ["PENDING", "FULFILLED"]);
    assert.equal(parsed.model.entities[0]?.name, "Item");
    assert.equal(parsed.model.entities[0]?.fields[0]?.name, "id");
    assert.equal(parsed.model.entities[0]?.fields[0]?.type, "UUID");
  });

  it("lowers product @guide prose lines into guide[] via registry path", () => {
    const source = `pactia 1.0
import @pactia/kernel;

product Demo {
  @guide {
    > First guidance line
    > Second guidance line
  }

  module billing {
    service OrderService {
      @api ping {
        method: GET,
        path: "/ping",
      }
    }
  }
}`;

    const { lowered } = compileThroughLower(source, kernelRegistry());
    assert.equal(lowered.diagnostics.length, 0);
    const productJson = lowered.files.get("input/product.json");
    assert.ok(productJson);
    const parsed = JSON.parse(productJson!) as { product: { guide?: string[] } };
    assert.deepEqual(parsed.product.guide, ["First guidance line", "Second guidance line"]);
  });
});
