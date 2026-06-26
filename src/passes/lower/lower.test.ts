import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { repoRoot } from "../../../test/fixture-paths.js";
import { IrFile } from "../../domain/ir-file.js";
import { IrMerge } from "../../domain/ir-merge.js";
import { RegistryEntryKind } from "../../domain/registry.js";
import { parseIrPath, primaryModifierField } from "./ir-slot-writer.js";
import { lowerBoundTree } from "./lower-bound-tree.js";
import { bindSyntaxTree } from "../bind/bind-syntax-tree.js";
import { expandBoundTree } from "../expand-macros/expand-bound-tree.js";
import { parseSyntaxTree } from "../parse/recursive-descent-parser.js";
import { registryEntriesFromProgram } from "../registry/build-effective-registry.js";

const testIrPackage = join(
  repoRoot,
  "test/fixtures/packages/@pactia--test-ir@1.0.0",
);
const kernelPackage = join(
  repoRoot,
  "test/fixtures/packages/@pactia--kernel@1.0.0",
);

function registryFromPackage(packageRoot: string, coordinate: string) {
  const indexSource = readFileSync(join(packageRoot, "index.pactia"), "utf8");
  const program = parseSyntaxTree({
    source: indexSource,
    entryFile: "index.pactia",
  }).root;
  const parsed = registryEntriesFromProgram(program, coordinate);
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
      fields: {
        required: ["bodyRef"],
        optional: [],
        modifier: true,
        openExtension: false,
      },
      modifier: true,
      ir: {
        file: IrFile.Service,
        path: "response",
        merge: IrMerge.MergeIntoHost,
      },
    };
    assert.equal(primaryModifierField(entry), "bodyRef");
  });
});

describe("lowerBoundTree", () => {
  it("lowers @output prefix and @api append_host into service body in order", () => {
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

    const serviceJson = lowered.files.get(
      "input/modules/billing/services/order.service.json",
    );
    assert.ok(serviceJson);
    const parsed = JSON.parse(serviceJson!) as {
      service: {
        name: string;
        body: Array<Record<string, unknown>>;
      };
    };

    assert.equal(parsed.service.name, "OrderService");
    assert.equal(parsed.service.body.length, 1);
    const extension = parsed.service.body[0]!;
    assert.equal(extension["tag"], "api");
    assert.equal(extension["id"], "create_order");
    assert.equal(extension["method"], "POST");
    assert.equal(extension["path"], "/api/v1/orders");
    assert.deepEqual(extension["modifierTags"], ["output"]);
    assert.deepEqual(extension["modifiers"], { bodyRef: "OrderResponse" });
    assert.equal(extension["provenance"], "Pactia");
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
    const workspace = JSON.parse(
      lowered.files.get("input/workspace.json")!,
    ) as {
      manifest: { manifest: { modules: Array<{ name: string }> } };
      product: { product: { name?: string } };
      modules: Array<{ module: { module: { name?: string } } }>;
    };
    assert.equal(workspace.manifest.manifest.modules[0]?.name, "billing");
    assert.equal(workspace.modules[0]?.module.module.name, "billing");
  });

  it("lowers enum and entity host tags into model body in source order", () => {
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

      @enum Priority {
        values: [LOW, HIGH],
      }
    }
  }
}`;

    const { lowered } = compileThroughLower(source, kernelRegistry());
    assert.equal(lowered.diagnostics.length, 0);

    const modelJson = lowered.files.get(
      "input/modules/billing/billing.model.json",
    );
    assert.ok(modelJson);
    const parsed = JSON.parse(modelJson!) as {
      model: {
        body: Array<Record<string, unknown>>;
      };
    };

    assert.equal(parsed.model.body.length, 3);
    assert.equal(parsed.model.body[0]?.["tag"], "enum");
    assert.equal(parsed.model.body[0]?.["name"], "Status");
    assert.deepEqual(parsed.model.body[0]?.["values"], [
      "PENDING",
      "FULFILLED",
    ]);
    assert.equal(parsed.model.body[1]?.["tag"], "entity");
    assert.equal(parsed.model.body[1]?.["name"], "Item");
    const fields = parsed.model.body[1]?.["fields"] as Array<{
      name: string;
      type: string;
    }>;
    assert.equal(fields[0]?.name, "id");
    assert.equal(fields[0]?.type, "UUID");
    assert.equal(parsed.model.body[2]?.["tag"], "enum");
    assert.equal(parsed.model.body[2]?.["name"], "Priority");
    assert.deepEqual(parsed.model.body[2]?.["values"], ["LOW", "HIGH"]);
  });

  it("lowers product prose, context, and tags in source order", () => {
    const source = `pactia 1.0
import @pactia/kernel;

product Demo {
  > Opening line

  context docs {
    path: "./docs/readme.md",
  }

  @topology {
    mode: single,
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
    const parsed = JSON.parse(productJson!) as {
      product: {
        body: Array<Record<string, unknown>>;
        context: Array<{ name: string }>;
      };
    };
    assert.equal(parsed.product.body[0]?.["kind"], "prose");
    assert.equal(parsed.product.context[0]?.name, "docs");
    assert.equal(parsed.product.body[1]?.["tag"], "topology");
  });

  it("merges stacked modifiers into the next api body entry", () => {
    const source = `pactia 1.0
import { @api, @@output, @@input } from @pactia/kernel;

product Demo {
  module billing {
    service OrderService {
      @@output OrderResponse
      @@input CreateOrderRequest
      @api create_order {
        method: POST,
        path: "/api/v1/orders",
      }
    }
  }
}`;

    const { lowered } = compileThroughLower(source, kernelRegistry());
    assert.equal(lowered.diagnostics.length, 0);
    const serviceJson = lowered.files.get(
      "input/modules/billing/services/order.service.json",
    );
    assert.ok(serviceJson);
    const body = (JSON.parse(serviceJson!) as {
      service: { body: Array<Record<string, unknown>> };
    }).service.body;
    assert.equal(body.length, 1);
    assert.equal(body[0]?.["tag"], "api");
    assert.deepEqual(body[0]?.["modifierTags"], ["output", "input"]);
  });

  it("lowers nested surface tags inside api body in order", () => {
    const source = `pactia 1.0
import { @api, @surface, @@output } from @pactia/kernel;

product Demo {
  module billing {
    service OrderService {
      @@output OrderListResponse
      @api list_orders {
        method: GET,
        path: "/api/v1/orders",
        @surface order_list {
          platform: web,
          screen: { id: order_list },
          route: { path: "/orders" },
        }
      }
    }
  }
}`;

    const { lowered } = compileThroughLower(source, kernelRegistry());
    assert.equal(lowered.diagnostics.length, 0);
    const serviceJson = lowered.files.get(
      "input/modules/billing/services/order.service.json",
    );
    assert.ok(serviceJson);
    const apiEntry = (JSON.parse(serviceJson!) as {
      service: { body: Array<Record<string, unknown>> };
    }).service.body[0]!;
    const nested = apiEntry["body"] as Array<{ tag: string; id?: string }>;
    assert.equal(apiEntry["tag"], "api");
    assert.equal(nested[0]?.tag, "surface");
    assert.equal(nested[0]?.id, "order_list");
  });

  it("lowers product @guide prose into product body in order", () => {
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
    const parsed = JSON.parse(productJson!) as {
      product: { body?: unknown[] };
    };
    const guideEntries = (parsed.product.body ?? []).filter(
      (entry) => (entry as { tag?: string }).tag === "guide",
    );
    assert.equal(guideEntries.length, 2);
    assert.deepEqual(guideEntries[0], {
      tag: "guide",
      text: "First guidance line",
      provenance: "GUIDANCE",
    });
    assert.deepEqual(guideEntries[1], {
      tag: "guide",
      text: "Second guidance line",
      provenance: "GUIDANCE",
    });
  });

  it("expands product-level stack macro into product body at macro site", () => {
    const rustAnbRoot = join(
      repoRoot,
      "test/fixtures/packages/@pactia--rust-stack@1.0.0",
    );
    const kernelRoot = join(
      repoRoot,
      "test/fixtures/packages/@pactia--kernel@1.0.0",
    );
    const rustAnb = registryFromPackage(rustAnbRoot, "@pactia/rust-stack");
    const kernel = registryFromPackage(kernelRoot, "@pactia/kernel");
    const registry = {
      tags: new Map([...kernel.tags, ...rustAnb.tags]),
      macros: new Map([...kernel.macros, ...rustAnb.macros]),
    };

    const source = `pactia 1.0
import @pactia/kernel;
import { #rust-stack } from @pactia/rust-stack;

product Demo {
  > Demo product

  #rust-stack

  module billing {
    service OrderService {
      @api ping {
        method: GET,
        path: "/ping",
      }
    }
  }
}`;

    const { lowered } = compileThroughLower(source, registry);
    const productJson = lowered.files.get("input/product.json");
    assert.ok(productJson);
    const parsed = JSON.parse(productJson!) as {
      product: {
        body?: Array<Record<string, unknown>>;
      };
    };
    const stackEntry = parsed.product.body?.find((entry) => entry["tag"] === "stack");
    assert.ok(stackEntry);
    assert.equal(stackEntry["language"], "rust");
    assert.equal(stackEntry["framework"], "actix-web");
    assert.equal(stackEntry["package"], "@pactia/rust-stack");
    const allowed = stackEntry["allowedCrates"];
    assert.ok(Array.isArray(allowed) && allowed.some((c) => /tokio/i.test(String(c))));
    const denied = stackEntry["deniedCrates"];
    assert.ok(Array.isArray(denied) && denied.some((c) => /rocket/i.test(String(c))));
  });
});
