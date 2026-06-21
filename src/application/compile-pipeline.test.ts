import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { repoRoot } from "../../test/fixture-paths.js";
import { CompilePhase } from "../domain/compile-phase.js";
import { DiagnosticSeverity } from "../domain/diagnostic-code.js";
import { BoundNodeKind } from "../domain/bound-tree.js";
import { IrMerge } from "../domain/ir-merge.js";
import { FsRegistryLoader } from "../adapters/fs-registry-loader.js";
import { TomlLockReader } from "../adapters/toml-lock-reader.js";
import { parseSyntaxTree } from "../passes/parse/recursive-descent-parser.js";
import { CompilePipeline } from "./compile-pipeline.js";

const relayWorkspace = join(repoRoot, "test/fixtures/workspace/relay");
const relayProductSource = readFileSync(join(relayWorkspace, "product.pactia"), "utf8");
const relayMonolithSource = readFileSync(join(repoRoot, "test/fixtures/kernel/relay.pactia"), "utf8");
const testIrWorkspace = join(repoRoot, "test/fixtures/workspace/test-ir");

describe("CompilePipeline v2 wiring", () => {
  it("runs through parse and resolve-packages on relay workspace", () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
    try {
      const pipeline = new CompilePipeline({
        stopAfterPhase: CompilePhase.ResolvePackages,
        ports: {
          parser: { parse: (input) => parseSyntaxTree(input) },
          registryLoader: new FsRegistryLoader(),
          lockReader: new TomlLockReader(),
          irEmitter: { emit: () => ({ writtenPaths: [] }) },
        },
      });

      const result = pipeline.run({
        workspaceRoot: relayWorkspace,
        entryFile: "product.pactia",
        source: relayProductSource,
      });

      assert.equal(result.diagnostics.length, 0);
      assert.ok(result.syntax);
      assert.equal(result.syntax.root.product?.name, "Relay");
      assert.ok(result.registry.macros.has("paginated"));
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });

  it("runs bind phase on relay monolith and attaches stack macros", () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
    try {
      const pipeline = new CompilePipeline({
        stopAfterPhase: CompilePhase.Bind,
        ports: {
          parser: { parse: (input) => parseSyntaxTree(input) },
          registryLoader: new FsRegistryLoader(),
          lockReader: new TomlLockReader(),
          irEmitter: { emit: () => ({ writtenPaths: [] }) },
        },
      });

      const result = pipeline.run({
        workspaceRoot: relayWorkspace,
        entryFile: "product.pactia",
        source: relayMonolithSource,
      });

      assert.ok(result.bound);
      assert.equal(result.bound.root.hostName, "Relay");
      const ordersModule = result.bound.root.children.find(
        (child) => child.kind === BoundNodeKind.BoundBlock && child.hostName === "orders",
      );
      assert.ok(ordersModule);
      assert.equal(result.diagnostics.length, 0);
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });

  it("expands stack macros through expand-macros phase on relay service", () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
    try {
      const pipeline = new CompilePipeline({
        stopAfterPhase: CompilePhase.ExpandMacros,
        ports: {
          parser: { parse: (input) => parseSyntaxTree(input) },
          registryLoader: new FsRegistryLoader(),
          lockReader: new TomlLockReader(),
          irEmitter: { emit: () => ({ writtenPaths: [] }) },
        },
      });

      const result = pipeline.run({
        workspaceRoot: relayWorkspace,
        entryFile: "product.pactia",
        source: relayMonolithSource,
      });

      assert.ok(result.bound);
      const ordersModule = result.bound.root.children.find(
        (child) => child.kind === BoundNodeKind.BoundBlock && child.hostName === "orders",
      );
      assert.ok(ordersModule && ordersModule.kind === BoundNodeKind.BoundBlock);
      const orderService = ordersModule.children.find(
        (child) => child.kind === BoundNodeKind.BoundBlock && child.hostName === "OrderService",
      );
      assert.ok(orderService && orderService.kind === BoundNodeKind.BoundBlock);

      const listEndpointPrep = orderService.children.filter(
        (child) =>
          child.kind === BoundNodeKind.BoundTag &&
          child.hostId === "list_orders" &&
          child.registryEntry.ir.merge === IrMerge.AppendHost,
      );
      assert.ok(listEndpointPrep.length >= 1);
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });

  it("lowers through lower phase with test-ir registry tags", () => {
    const previous = process.env["PACTIA_VENDOR_ROOT"];
    process.env["PACTIA_VENDOR_ROOT"] = join(repoRoot, "test/fixtures/packages");
    try {
      const source = `pactia 1.0
import @pactia/test-ir;

product Demo {
  module billing {
    service OrderService {
      @output OrderResponse
      @api create_order {
        method: POST,
        path: "/api/v1/orders",
      }
    }
  }
}`;

      const pipeline = new CompilePipeline({
        stopAfterPhase: CompilePhase.Lower,
        ports: {
          parser: { parse: (input) => parseSyntaxTree(input) },
          registryLoader: new FsRegistryLoader(),
          lockReader: new TomlLockReader(),
          irEmitter: { emit: () => ({ writtenPaths: [] }) },
        },
      });

      const result = pipeline.run({
        workspaceRoot: testIrWorkspace,
        entryFile: "product.pactia",
        source,
      });

      const errors = result.diagnostics.filter((d) => d.severity === DiagnosticSeverity.Error);
      assert.equal(errors.length, 0, errors.map((d) => d.message).join("; "));
      assert.ok(result.lowered);
      assert.ok(result.files.get("input/modules/billing/services/order.service.json"));
    } finally {
      if (previous === undefined) delete process.env["PACTIA_VENDOR_ROOT"];
      else process.env["PACTIA_VENDOR_ROOT"] = previous;
    }
  });
});
