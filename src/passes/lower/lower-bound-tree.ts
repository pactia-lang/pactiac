import { Provenance } from "../../domain/provenance.js";
import type { WorkspaceIr } from "../../domain/workspace-ir.js";
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
import type { RegistryTagEntry } from "../../domain/registry.js";
import { SyntaxNodeKind, type FieldLineNode, type ProseNode } from "../../domain/syntax-tree.js";
import { emitIrFileMap } from "../../adapters/json-emitter.js";
import { serviceFileStem } from "../../frontend/kernel/text.js";
import {
  IrRelativePath,
  moduleIrPaths,
  serviceIrPath,
} from "../../domain/workspace-ir.js";
import { mergeDeep, getAtPath, parseScalarValue, setAtPath } from "../../lower/ir-path.js";
import {
  appendHostObject,
  boundLeafBodyToObject,
  collectBlockProse,
  collectServiceProse,
  mergePrefixShorthand,
  mergeTagBlock,
  parseIrPath,
} from "./ir-slot-writer.js";

const COMPILED_AT = "1970-01-01T00:00:00.000Z";

export interface LowerBoundTreeInput {
  readonly tree: BoundTree;
  readonly pactiaVersion: string;
  readonly entryFile: string;
  readonly lockfileDigest?: string;
}

export interface LowerBoundTreeResult {
  readonly workspace: WorkspaceIr;
  readonly files: ReadonlyMap<string, string>;
  readonly diagnostics: readonly Diagnostic[];
}

type WritableRecord = Record<string, unknown>;

/** In-memory IR during lowering — slots appear only when registry paths write them. */
interface LazyModuleBundle {
  readonly module: { readonly module: WritableRecord };
  readonly model: { readonly model: WritableRecord };
  readonly services: Array<{ readonly service: WritableRecord }>;
}

interface CrossFileBind {
  readonly service: string;
  readonly endpoint?: string;
}

interface LowerFrame {
  readonly crossFileBind?: CrossFileBind;
}

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
  private readonly modules: LazyModuleBundle[] = [];
  private productDoc: WritableRecord = {};
  private currentModule: LazyModuleBundle | undefined;
  private serviceRoot: WritableRecord | undefined;
  private pendingHost: WritableRecord = {};

  constructor(
    private readonly input: LowerBoundTreeInput,
    private readonly diagnostics: Diagnostic[],
  ) {}

  lower(): WorkspaceIr {
    const root = this.input.tree.root;
    if (root.hostName && root.placement === PlacementTarget.Product) {
      this.productDoc = {
        name: root.hostName,
      };
      this.lowerBlock(root);
    } else {
      for (const child of root.children) {
        this.lowerTreeItem(child, IrFile.Product);
      }
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
            const moduleName = String(bundle.module.module["name"]);
            return {
              name: moduleName,
              path: `modules/${moduleName}/`,
              module: `${moduleName}.module.json`,
              model: `${moduleName}.model.json`,
              services: bundle.services.map((serviceSlice) => {
                const stem = serviceFileStem(String(serviceSlice.service["name"]));
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
      product: { product: this.productDoc },
      modules: this.modules,
    } as WorkspaceIr;
  }

  private lowerTreeItem(item: BoundTreeItem, scopeFile: IrFile): void {
    if (item.kind === BoundNodeKind.BoundBlock) {
      this.lowerBlock(item);
      return;
    }
    if (item.kind === BoundNodeKind.BoundTag) {
      this.lowerRegistryTag(item, {}, scopeFile);
      return;
    }
    if (item.kind === SyntaxNodeKind.FieldLine && scopeFile === IrFile.Service) {
      this.applyServiceFieldLine(item);
    }
  }

  private lowerBlock(block: BoundBlockNode): void {
    switch (block.placement) {
      case PlacementTarget.Product: {
        const description = collectBlockProse(block.children);
        if (description) {
          this.productDoc["description"] = description;
        }
        for (const child of block.children) {
          if (child.kind === SyntaxNodeKind.Prose) {
            continue;
          }
          this.lowerTreeItem(child, IrFile.Product);
        }
        break;
      }
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
    const bundle: LazyModuleBundle = {
      module: { module: { name } },
      model: { model: { name } },
      services: [],
    };
    this.currentModule = bundle;
    this.modules.push(bundle);
  }

  private lowerModelBlock(block: BoundBlockNode): void {
    if (!this.currentModule) return;
    for (const child of block.children) {
      this.lowerTreeItem(child, IrFile.Model);
    }
  }

  private lowerServiceBlock(block: BoundBlockNode): void {
    if (!this.currentModule || !block.hostName) return;

    this.pendingHost = {};
    this.serviceRoot = { name: block.hostName };

    const description = collectServiceProse(block.children);
    if (description) {
      this.serviceRoot["description"] = description;
    }

    for (const child of block.children) {
      this.lowerTreeItem(child, IrFile.Service);
    }

    this.currentModule.services.push({ service: this.serviceRoot });
    this.serviceRoot = undefined;
    this.pendingHost = {};
  }

  private applyServiceFieldLine(line: FieldLineNode): void {
    if (!this.serviceRoot || line.value === undefined) return;
    const value = parseScalarValue(line.value);
    if (line.name.startsWith("flags.")) {
      setAtPath(this.serviceRoot, line.name, value);
      return;
    }
    setAtPath(this.pendingHost, line.name, value);
  }

  private lowerRegistryTag(
    tag: BoundTagNode,
    frame: LowerFrame,
    scopeFile: IrFile,
  ): void {
    const entry = tag.registryEntry;
    if (entry.source === "unresolved") return;

    switch (entry.ir.merge) {
      case IrMerge.AppendHost:
        this.lowerAppendHost(tag, frame, scopeFile);
        break;
      case IrMerge.MergeIntoHost:
        this.lowerMergeIntoHost(tag, scopeFile);
        break;
      case IrMerge.MergeFields:
        mergeTagBlock(this.documentRoot(entry.ir.file), entry, tag.children);
        break;
      case IrMerge.FieldAnnotation:
        break;
      default:
        break;
    }
  }

  private lowerMergeIntoHost(tag: BoundTagNode, scopeFile: IrFile): void {
    const entry = tag.registryEntry;
    const target =
      scopeFile === IrFile.Service && this.serviceRoot
        ? this.pendingHost
        : this.documentRoot(entry.ir.file);

    if (tag.shorthand !== undefined) {
      mergePrefixShorthand(target, entry, tag.shorthand);
      return;
    }
    mergeTagBlock(target, entry, tag.children);
  }

  private lowerAppendHost(
    tag: BoundTagNode,
    frame: LowerFrame,
    scopeFile: IrFile,
  ): void {
    const entry = tag.registryEntry;
    const root = this.documentRoot(entry.ir.file);

    if (this.isProseOnlyBody(tag) && parseIrPath(entry.ir.path).appendArray) {
      for (const child of tag.children) {
        if (child.kind === SyntaxNodeKind.Prose && child.text.length > 0) {
          appendHostObject(root, entry.ir.path, child.text);
        }
      }
      return;
    }

    const host = this.buildAppendHost(tag, frame);
    for (const child of tag.children) {
      if (child.kind !== BoundNodeKind.BoundTag) continue;
      const childEntry = child.registryEntry;
      if (childEntry.ir.file !== entry.ir.file) {
        this.lowerRegistryTag(child, {
          crossFileBind: {
            service: String(this.serviceRoot?.["name"] ?? ""),
            endpoint: tag.hostId,
          },
        }, scopeFile);
        continue;
      }
      this.applyNestedTag(host, entry, child, frame);
    }

    host["provenance"] = Provenance.Pactia;
    appendHostObject(root, entry.ir.path, host);
  }

  private buildAppendHost(
    tag: BoundTagNode,
    frame: LowerFrame,
  ): WritableRecord {
    const entry = tag.registryEntry;
    const host: WritableRecord = { ...this.pendingHost };
    this.pendingHost = {};

    this.applyHostIdentity(host, tag, entry);

    if (tag.shorthand !== undefined) {
      mergePrefixShorthand(host, entry, tag.shorthand);
    }

    if (this.isOpenFieldHost(entry)) {
      this.collectOpenFieldHostBody(host, tag.children);
    } else {
      mergeDeep(host, boundLeafBodyToObject(this.nonTagBodyItems(tag.children)));
    }

    this.enrichAppendHost(host, entry, tag.enclosing, frame);
    this.promoteSummaryToText(host);
    return host;
  }

  /** Host identity key follows IR file conventions — model type hosts use `name`. */
  private applyHostIdentity(
    host: WritableRecord,
    tag: BoundTagNode,
    entry: RegistryTagEntry,
  ): void {
    if (!tag.hostId) return;
    const key = entry.ir.file === IrFile.Model ? "name" : "id";
    host[key] = tag.hostId;
  }

  /** Registry openExtension with no declared fields — body lines are nested field hosts. */
  private isOpenFieldHost(entry: RegistryTagEntry): boolean {
    return (
      entry.fields.openExtension &&
      entry.fields.required.length === 0 &&
      entry.fields.optional.length === 0
    );
  }

  private applyNestedTag(
    parentHost: WritableRecord,
    parentEntry: RegistryTagEntry,
    tag: BoundTagNode,
    frame: LowerFrame,
  ): void {
    const entry = tag.registryEntry;
    const slotPath = this.relativeSlotPath(parentEntry.ir.path, entry.ir.path);

    switch (entry.ir.merge) {
      case IrMerge.AppendHost: {
        const host = this.buildAppendHost(tag, frame);
        for (const child of tag.children) {
          if (child.kind === BoundNodeKind.BoundTag) {
            this.applyNestedTag(host, entry, child, frame);
          }
        }
        host["provenance"] = Provenance.Pactia;
        appendHostObject(parentHost, slotPath, host);
        break;
      }
      case IrMerge.MergeIntoHost:
        if (tag.shorthand !== undefined) {
          mergePrefixShorthand(parentHost, entry, tag.shorthand);
        } else {
          mergeTagBlock(parentHost, { ...entry, ir: { ...entry.ir, path: slotPath } }, tag.children);
        }
        break;
      case IrMerge.MergeFields:
        mergeTagBlock(parentHost, { ...entry, ir: { ...entry.ir, path: slotPath } }, tag.children);
        break;
      default:
        break;
    }
  }

  private relativeSlotPath(parentPath: string, childPath: string): string {
    const parentContainer = parseIrPath(parentPath).containerPath;
    if (childPath.startsWith(`${parentContainer}.`)) {
      return childPath.slice(parentContainer.length + 1);
    }
    return childPath;
  }

  private enrichAppendHost(
    host: WritableRecord,
    entry: RegistryTagEntry,
    enclosing: PlacementTarget,
    frame: LowerFrame,
  ): void {
    if (
      enclosing === PlacementTarget.Module &&
      entry.ir.file === IrFile.Product &&
      this.currentModule &&
      host["module"] === undefined
    ) {
      host["module"] = this.currentModule.module.module["name"];
    }

    if (frame.crossFileBind && entry.ir.file === IrFile.Product && host["bind"] === undefined) {
      host["bind"] = {
        service: frame.crossFileBind.service,
        endpoint: frame.crossFileBind.endpoint,
      };
    }
  }

  private isProseOnlyBody(tag: BoundTagNode): boolean {
    return (
      tag.children.length > 0 &&
      tag.children.every((child) => child.kind === SyntaxNodeKind.Prose)
    );
  }

  private collectOpenFieldHostBody(host: WritableRecord, items: readonly BoundTreeItem[]): void {
    const fields: WritableRecord[] = [];
    let currentField: WritableRecord | undefined;

    for (const item of items) {
      if (item.kind === SyntaxNodeKind.FieldLine) {
        currentField = this.parseModelFieldLine(item);
        fields.push(currentField);
        continue;
      }
      if (
        item.kind === BoundNodeKind.BoundTag &&
        item.registryEntry.ir.merge === IrMerge.FieldAnnotation &&
        currentField
      ) {
        this.applyFieldAnnotation(currentField, item);
      }
    }

    host["fields"] = fields;
  }

  private parseModelFieldLine(line: FieldLineNode): WritableRecord {
    const raw = (line.value ?? "unknown").trim();
    const array = raw.endsWith("[]");
    const baseType = array ? raw.slice(0, -2).trim() : raw;
    return {
      name: line.name,
      type: String(parseScalarValue(baseType)).toUpperCase(),
      array,
      optional: !line.required && line.value === undefined,
    };
  }

  private applyFieldAnnotation(field: WritableRecord, tag: BoundTagNode): void {
    const entry = tag.registryEntry;
    const annotations = (field["annotations"] as WritableRecord | undefined) ?? {};
    if (tag.shorthand !== undefined) {
      mergePrefixShorthand(annotations, entry, tag.shorthand);
    } else {
      mergeDeep(annotations, boundLeafBodyToObject(tag.children));
    }
    if (Object.keys(annotations).length > 0) {
      field["annotations"] = annotations;
    }
  }

  private nonTagBodyItems(items: readonly BoundTreeItem[]): BoundTreeItem[] {
    return items.filter((item) => item.kind !== BoundNodeKind.BoundTag);
  }

  private promoteSummaryToText(host: WritableRecord): void {
    if (typeof host["summary"] === "string" && host["text"] === undefined) {
      host["text"] = host["summary"];
      delete host["summary"];
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

function workspaceToFileObjects(workspace: WorkspaceIr): Map<string, unknown> {
  const files = new Map<string, unknown>();
  files.set(IrRelativePath.Workspace, workspace);
  files.set(IrRelativePath.Manifest, workspace.manifest);
  files.set(IrRelativePath.Product, workspace.product);

  for (const bundle of workspace.modules) {
    const moduleName = String((bundle.module as { module: Record<string, unknown> }).module["name"]);
    const paths = moduleIrPaths(moduleName);
    files.set(paths.module, bundle.module);
    files.set(paths.model, bundle.model);

    for (const serviceSlice of bundle.services) {
      const stem = serviceFileStem(String((serviceSlice as { service: Record<string, unknown> }).service["name"]));
      const servicePath = serviceIrPath(moduleName, stem);
      files.set(servicePath, serviceSlice);
    }
  }

  return files;
}
