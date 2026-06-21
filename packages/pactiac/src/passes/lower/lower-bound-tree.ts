import { Provenance, type IrModuleBundle, type IrWorkspace } from "@pactia/schema";
import {
  BoundNodeKind,
  DiagnosticCode,
  IrFile,
  IrMerge,
  PlacementTarget,
  createDiagnostic,
  type BoundBlockNode,
  type BoundTagNode,
  type BoundTree,
  type BoundTreeItem,
} from "../../domain/index.js";
import type { Diagnostic } from "../../domain/diagnostics.js";
import { SyntaxNodeKind, type FieldLineNode } from "../../domain/syntax-tree.js";
import { emitIrFileMap } from "../../adapters/json-emitter.js";
import { serviceFileStem } from "../../frontend/kernel/text.js";
import {
  IrRelativePath,
  moduleIrPaths,
  serviceIrPath,
} from "../../domain/workspace-ir.js";
import { mergeDeep, parseScalarValue, setAtPath } from "../../lower/ir-path.js";
import {
  appendHostObject,
  boundLeafBodyToObject,
  collectServiceProse,
  mergePrefixShorthand,
  mergeTagBlock,
} from "./ir-slot-writer.js";

const COMPILED_AT = "1970-01-01T00:00:00.000Z";

export interface LowerBoundTreeInput {
  readonly tree: BoundTree;
  readonly pactiaVersion: string;
  readonly entryFile: string;
  readonly lockfileDigest?: string;
}

export interface LowerBoundTreeResult {
  readonly workspace: IrWorkspace;
  readonly files: ReadonlyMap<string, string>;
  readonly diagnostics: readonly Diagnostic[];
}

type WritableRecord = Record<string, unknown>;

export function lowerBoundTree(input: LowerBoundTreeInput): LowerBoundTreeResult {
  const diagnostics: Diagnostic[] = [];
  const lowerer = new BoundTreeLowerer(input, diagnostics);
  const workspace = lowerer.lower();
  const fileObjects = workspaceToFileObjects(workspace);
  return {
    workspace,
    files: emitIrFileMap(fileObjects),
    diagnostics,
  };
}

class BoundTreeLowerer {
  private readonly modules: IrModuleBundle[] = [];
  private productDoc: WritableRecord = {};
  private currentModule: IrModuleBundle | undefined;
  private servicePendingHost: WritableRecord = {};
  private serviceRoot: WritableRecord | undefined;

  constructor(
    private readonly input: LowerBoundTreeInput,
    private readonly diagnostics: Diagnostic[],
  ) {}

  lower(): IrWorkspace {
    const root = this.input.tree.root;
    if (root.hostName) {
      this.productDoc = { name: root.hostName, stackId: "unknown", surfaces: [] };
    }

    for (const child of root.children) {
      this.lowerTreeItem(child, IrFile.Product);
    }

    if (this.modules.length === 0) {
      this.diagnostics.push(
        createDiagnostic(DiagnosticCode.ParseError, "Lower requires at least one module"),
      );
    }

    return {
      manifest: {
        manifest: {
          pactiaVersion: this.input.pactiaVersion,
          compiledAt: COMPILED_AT,
          entry: this.input.entryFile,
          lockfileDigest: this.input.lockfileDigest ?? `sha256:${"0".repeat(64)}`,
          modules: this.modules.map((bundle) => {
            const moduleName = bundle.module.module.name;
            return {
              name: moduleName,
              path: `modules/${moduleName}/`,
              module: `${moduleName}.module.json`,
              model: `${moduleName}.model.json`,
              services: bundle.services.map((serviceSlice) => {
                const stem = serviceFileStem(serviceSlice.service.name);
                return {
                  name: stem,
                  file: `services/${stem}.service.json`,
                };
              }),
            };
          }),
          references: [],
        },
      },
      product: { product: this.productDoc as IrWorkspace["product"]["product"] },
      modules: this.modules,
    };
  }

  private lowerTreeItem(item: BoundTreeItem, file: IrFile): void {
    if (item.kind === BoundNodeKind.BoundBlock) {
      this.lowerBlock(item);
      return;
    }
    if (item.kind === BoundNodeKind.BoundTag) {
      this.lowerTag(item, file, this.documentRoot(file));
      return;
    }
    if (item.kind === SyntaxNodeKind.FieldLine && file === IrFile.Service) {
      this.applyServiceFieldLine(item);
    }
  }

  private lowerBlock(block: BoundBlockNode): void {
    switch (block.placement) {
      case PlacementTarget.Product:
        for (const child of block.children) {
          this.lowerTreeItem(child, IrFile.Product);
        }
        break;
      case PlacementTarget.Module:
        this.openModule(block.hostName ?? "module");
        for (const child of block.children) {
          if (child.kind === BoundNodeKind.BoundBlock && child.placement === PlacementTarget.Model) {
            this.lowerModelBlock(child);
            continue;
          }
          if (child.kind === BoundNodeKind.BoundBlock && child.placement === PlacementTarget.Service) {
            this.lowerServiceBlock(child);
            continue;
          }
          this.lowerTreeItem(child, IrFile.Module);
        }
        break;
      default:
        break;
    }
  }

  private openModule(name: string): void {
    const bundle: IrModuleBundle = {
      module: {
        module: {
          name,
          actors: [],
          rules: [],
          integrations: [],
          events: [],
          eventHandlers: [],
          dependsOn: [],
        },
      },
      model: {
        model: {
          entities: [],
          enums: [],
          relations: [],
          stateMachines: [],
          rules: [],
        },
      },
      services: [],
    };
    this.currentModule = bundle;
    this.modules.push(bundle);
  }

  private lowerModelBlock(block: BoundBlockNode): void {
    if (!this.currentModule) return;
    const modelRoot = this.currentModule.model.model as WritableRecord;
    for (const child of block.children) {
      if (child.kind === BoundNodeKind.BoundTag) {
        this.lowerTag(child, IrFile.Model, modelRoot);
      }
    }
  }

  private lowerServiceBlock(block: BoundBlockNode): void {
    if (!this.currentModule || !block.hostName) return;

    this.servicePendingHost = {};
    this.serviceRoot = {
      name: block.hostName,
      endpoints: [],
      scenarios: [],
      obligations: [],
    };

    const description = collectServiceProse(block.children);
    if (description) {
      this.serviceRoot["description"] = description;
    }

    for (const child of block.children) {
      if (child.kind === SyntaxNodeKind.FieldLine) {
        this.applyServiceFieldLine(child);
        continue;
      }
      if (child.kind === BoundNodeKind.BoundTag) {
        this.lowerServiceTag(child);
      }
    }

    this.currentModule.services.push({
      service: this.serviceRoot as IrModuleBundle["services"][number]["service"],
    });
    this.serviceRoot = undefined;
    this.servicePendingHost = {};
  }

  private applyServiceFieldLine(line: FieldLineNode): void {
    if (!this.serviceRoot || line.value === undefined) return;
    setAtPath(this.servicePendingHost, line.name, parseScalarValue(line.value));
  }

  private lowerServiceTag(tag: BoundTagNode): void {
    if (!this.serviceRoot) return;
    const entry = tag.registryEntry;
    if (entry.source === "unresolved") return;

    switch (entry.ir.merge) {
      case IrMerge.AppendHost:
        this.flushServiceHost(tag);
        break;
      case IrMerge.MergeIntoHost:
        if (tag.shorthand !== undefined) {
          mergePrefixShorthand(this.servicePendingHost, entry, tag.shorthand);
        } else {
          mergeTagBlock(this.servicePendingHost, entry, tag.children);
        }
        break;
      case IrMerge.MergeFields:
        mergeTagBlock(this.serviceRoot, entry, tag.children);
        break;
      default:
        break;
    }
  }

  private flushServiceHost(tag: BoundTagNode): void {
    if (!this.serviceRoot) return;

    const host: WritableRecord = { ...this.servicePendingHost };
    this.servicePendingHost = {};

    if (tag.hostId) {
      host["id"] = tag.hostId;
    }

    mergeDeep(host, boundLeafBodyToObject(tag.children));

    for (const child of tag.children) {
      if (child.kind === BoundNodeKind.BoundTag) {
        this.mergeNestedServiceTag(host, child);
      }
    }

    host["provenance"] = Provenance.Pactia;
    appendHostObject(this.serviceRoot, tag.registryEntry.ir.path, host);
  }

  private mergeNestedServiceTag(host: WritableRecord, tag: BoundTagNode): void {
    if (tag.shorthand !== undefined) {
      mergePrefixShorthand(host, tag.registryEntry, tag.shorthand);
    }
    mergeDeep(host, boundLeafBodyToObject(tag.children));
  }

  private lowerTag(tag: BoundTagNode, file: IrFile, root: WritableRecord): void {
    const entry = tag.registryEntry;
    if (entry.source === "unresolved") return;

    if (entry.ir.file !== file) {
      this.diagnostics.push(
        createDiagnostic(
          DiagnosticCode.ParseError,
          `Tag '@${tag.tagName}' targets ${entry.ir.file} but appears under ${file}`,
          { location: tag.location, target: tag.tagName },
        ),
      );
      return;
    }

    switch (entry.ir.merge) {
      case IrMerge.AppendHost: {
        const host: WritableRecord = tag.hostId ? { id: tag.hostId } : {};
        if (tag.shorthand !== undefined) {
          mergePrefixShorthand(host, entry, tag.shorthand);
        }
        mergeDeep(host, boundLeafBodyToObject(tag.children));
        host["provenance"] = Provenance.Pactia;
        appendHostObject(root, entry.ir.path, host);
        break;
      }
      case IrMerge.MergeIntoHost:
        if (tag.shorthand !== undefined) {
          mergePrefixShorthand(root, entry, tag.shorthand);
        } else {
          mergeTagBlock(root, entry, tag.children);
        }
        break;
      case IrMerge.MergeFields:
        mergeTagBlock(root, entry, tag.children);
        break;
      default:
        break;
    }
  }

  private documentRoot(file: IrFile): WritableRecord {
    switch (file) {
      case IrFile.Product:
        return this.productDoc;
      case IrFile.Module:
        return (this.currentModule?.module.module ?? {}) as WritableRecord;
      case IrFile.Model:
        return (this.currentModule?.model.model ?? {}) as WritableRecord;
      case IrFile.Service:
        return this.serviceRoot ?? {};
      default:
        return {};
    }
  }
}

function workspaceToFileObjects(workspace: IrWorkspace): Map<string, unknown> {
  const files = new Map<string, unknown>();
  files.set(IrRelativePath.Manifest, workspace.manifest);
  files.set(IrRelativePath.Product, workspace.product);

  for (const bundle of workspace.modules) {
    const moduleName = bundle.module.module.name;
    const paths = moduleIrPaths(moduleName);
    files.set(paths.module, bundle.module);
    files.set(paths.model, bundle.model);

    for (const serviceSlice of bundle.services) {
      const stem = serviceFileStem(serviceSlice.service.name);
      files.set(serviceIrPath(moduleName, stem), serviceSlice);
    }
  }

  return files;
}
