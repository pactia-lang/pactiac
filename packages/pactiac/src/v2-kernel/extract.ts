import type { ScenarioDecl } from "../ast.js";
import { extractV2Tests } from "../v2-test-parser.js";
import { collectTagBlocks, extractBlockAfter, findMatchingBrace } from "./brace.js";
import {
  extractProseLines,
  normalizeAuthType,
  normalizeDirection,
  normalizeTenancyMode,
  normalizeTopologyMode,
  proseToGuidance,
  proseToText,
  scalarTypeToIr,
  stripFieldValue,
} from "./text.js";

export interface V2Actor {
  readonly id: string;
  readonly role: string;
  readonly capabilities: string[];
}

export interface V2Rule {
  readonly id: string;
  readonly text: string;
}

export interface V2ConfigEntry {
  readonly required?: boolean;
  readonly secret?: boolean;
  readonly default?: string;
  readonly description?: string | string[];
}

export interface V2ErrorDef {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

export interface V2Event {
  readonly id: string;
  readonly payload?: string;
  readonly handler?: string;
  readonly description?: string | string[];
}

export interface V2EntityField {
  readonly name: string;
  readonly type: string;
  readonly array: boolean;
  readonly optional: boolean;
  readonly annotations: {
    readonly primary?: boolean;
    readonly unique?: boolean;
    readonly nullable?: boolean;
    readonly pii?: boolean;
    readonly references?: { entity: string; field?: string };
  };
}

export interface V2Entity {
  readonly name: string;
  readonly fields: V2EntityField[];
}

export interface V2Enum {
  readonly name: string;
  readonly values: string[];
}

export interface V2Relation {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly verb?: string;
  readonly cardinality?: string;
}

export interface V2StateMachine {
  readonly id: string;
  readonly entity: string;
  readonly transitions: Array<{ from: string; to: string }>;
}

export interface V2Surface {
  readonly id: string;
  readonly platform?: string;
  readonly screenId?: string;
  readonly routePath?: string;
  readonly nav?: Record<string, unknown>;
  readonly description?: string | string[];
  readonly apiId: string;
  readonly serviceName: string;
  readonly method?: string;
  readonly path?: string;
}

export interface V2Endpoint {
  readonly id: string;
  readonly method?: string;
  readonly path?: string;
  readonly summary?: string;
  readonly roles: string[];
  readonly isPublic: boolean;
  readonly inputType?: string;
  readonly outputType?: string;
  readonly status?: number;
  readonly throws: string[];
  readonly emits: string[];
  readonly macros: string[];
  readonly surfaces: V2Surface[];
}

export interface V2Service {
  readonly name: string;
  readonly description?: string;
  readonly flags: { database: boolean; cache: boolean; events: boolean };
  readonly endpoints: V2Endpoint[];
  readonly scenarios: ScenarioDecl[];
  readonly guide?: string | string[];
}

export interface V2Integration {
  readonly name: string;
  readonly direction: string;
  readonly authType?: string;
  readonly authEnv?: string;
  readonly mapsTo?: string;
  readonly purpose?: string | string[];
}

export interface V2DeployEnvironment {
  readonly id: string;
  readonly replicas?: number;
  readonly region?: string;
}

export interface V2DeployGate {
  readonly id: string;
  readonly scenarios?: string;
  readonly coverage?: string;
}

export interface V2Module {
  readonly name: string;
  readonly actors: V2Actor[];
  readonly rules: V2Rule[];
  readonly config: Record<string, Record<string, V2ConfigEntry>>;
  readonly errors: Record<string, V2ErrorDef>;
  readonly events: V2Event[];
  readonly integrations: V2Integration[];
  readonly observeSlos: Array<{ service: string; metric: string; target: string }>;
  readonly enums: V2Enum[];
  readonly entities: V2Entity[];
  readonly relations: V2Relation[];
  readonly stateMachines: V2StateMachine[];
  readonly modelRules: V2Rule[];
  readonly services: V2Service[];
}

export interface V2Product {
  readonly name: string;
  readonly description?: string;
  readonly stackPackage: string;
  readonly topologyMode?: string;
  readonly tenancyMode?: string;
  readonly guide?: string | string[];
  readonly deployId?: string;
  readonly environments: V2DeployEnvironment[];
  readonly gates: V2DeployGate[];
  readonly surfaces: V2Surface[];
}

export interface V2KernelProgram {
  readonly version: string;
  readonly imports: string[];
  readonly product: V2Product;
  readonly modules: V2Module[];
}

function parseBracketList(value: string): string[] {
  const match = /\[([^\]]*)\]/.exec(value);
  if (!match) return [];
  return match[1]!
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseEntityBlock(body: string, entityName: string): V2Entity {
  const fields: V2EntityField[] = [];
  const lines = body.split("\n");
  let pendingAnnotations: V2EntityField["annotations"] = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(">")) continue;

    if (line.startsWith("@pk")) {
      pendingAnnotations = { ...pendingAnnotations, primary: true };
      continue;
    }
    if (line.startsWith("@unique")) {
      pendingAnnotations = { ...pendingAnnotations, unique: true };
      continue;
    }
    if (line.startsWith("@nullable")) {
      pendingAnnotations = { ...pendingAnnotations, nullable: true };
      continue;
    }
    if (line.startsWith("@pii")) {
      pendingAnnotations = { ...pendingAnnotations, pii: true };
      continue;
    }
    if (line.startsWith("@fk")) {
      const entityMatch = /entity:\s*(\w+)/.exec(line);
      if (entityMatch) {
        pendingAnnotations = {
          ...pendingAnnotations,
          references: { entity: entityMatch[1]! },
        };
      }
      continue;
    }
    if (line.startsWith("@index")) {
      continue;
    }

    const fieldMatch = /^([\w]+):\s*([\w]+)(\[\])?,?$/.exec(line);
    if (!fieldMatch) continue;

    const name = fieldMatch[1]!;
    const typeName = fieldMatch[2]!;
    const array = Boolean(fieldMatch[3]);
    fields.push({
      name,
      type: scalarTypeToIr(typeName),
      array,
      optional: pendingAnnotations.nullable === true,
      annotations: { ...pendingAnnotations },
    });
    pendingAnnotations = {};
  }

  return { name: entityName, fields };
}

function parseEndpointModifiers(lines: readonly string[]): {
  roles: string[];
  isPublic: boolean;
  inputType?: string;
  outputType?: string;
  status?: number;
  throws: string[];
  emits: string[];
  macros: string[];
} {
  let roles: string[] = [];
  let isPublic = false;
  let inputType: string | undefined;
  let outputType: string | undefined;
  let status: number | undefined;
  const throws: string[] = [];
  const emits: string[] = [];
  const macros: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("@auth")) {
      const rolesMatch = /roles:\s*\[([^\]]+)\]/.exec(trimmed);
      if (rolesMatch) roles = parseBracketList(`[${rolesMatch[1]}]`);
    } else if (trimmed.startsWith("@public")) {
      isPublic = true;
    } else if (trimmed.startsWith("@input")) {
      inputType = stripFieldValue(trimmed.replace("@input", ""));
    } else if (trimmed.startsWith("@output")) {
      outputType = stripFieldValue(trimmed.replace("@output", ""));
    } else if (trimmed.startsWith("@status")) {
      status = Number.parseInt(stripFieldValue(trimmed.replace("@status", "")), 10);
    } else if (trimmed.startsWith("@throws")) {
      const namesMatch = /names:\s*\[([^\]]+)\]/.exec(trimmed);
      if (namesMatch) throws.push(...parseBracketList(`[${namesMatch[1]}]`));
    } else if (trimmed.startsWith("@emit")) {
      emits.push(stripFieldValue(trimmed.replace("@emit", "")));
    } else if (trimmed.startsWith("#[")) {
      const macroMatch = /#\[([\w(.,\s\d]+)\]/.exec(trimmed);
      if (macroMatch) macros.push(macroMatch[1]!);
    }
  }

  return { roles, isPublic, inputType, outputType, status, throws, emits, macros };
}

function parseApiBlock(
  apiId: string,
  body: string,
  modifiers: ReturnType<typeof parseEndpointModifiers>,
  serviceName: string,
): V2Endpoint {
  const methodMatch = /method:\s*(\w+)/.exec(body);
  const pathMatch = /path:\s*("[^"]+"|\S+)/.exec(body);
  const method = methodMatch?.[1];
  const path = pathMatch ? stripFieldValue(pathMatch[1]!) : undefined;
  const prose = proseToGuidance(extractProseLines(body));

  const surfaces: V2Surface[] = collectTagBlocks(body, "surface").map((block) => {
    const platformMatch = /platform:\s*(\w+)/.exec(block.body);
    const screenMatch = /id:\s*([\w.-]+)/.exec(block.body);
    const routeMatch = /path:\s*"([^"]+)"/.exec(block.body);
    const navMatch = /tab:\s*(\w+)/.exec(block.body);
    return {
      id: block.id ?? apiId,
      platform: platformMatch?.[1],
      screenId: screenMatch?.[1],
      routePath: routeMatch?.[1],
      nav: navMatch ? { tab: navMatch[1] } : undefined,
      description: proseToText(extractProseLines(block.body)),
      apiId,
      serviceName,
      method,
      path,
    };
  });

  return {
    id: apiId,
    method,
    path,
    summary: typeof prose === "string" ? prose : undefined,
    roles: modifiers.roles,
    isPublic: modifiers.isPublic,
    inputType: modifiers.inputType,
    outputType: modifiers.outputType,
    status: modifiers.status,
    throws: modifiers.throws,
    emits: modifiers.emits,
    macros: modifiers.macros,
    surfaces,
  };
}

function parseServiceBody(
  serviceName: string,
  body: string,
  scenarios: ScenarioDecl[],
): V2Service {
  const flags = {
    database: /#\[database\]/.test(body),
    cache: /#\[cache\]/.test(body),
    events: /#\[events\]/.test(body),
  };

  const endpoints: V2Endpoint[] = [];
  const apiPattern = /@api\s+([\w.-]+)\s*\{/g;
  let match: RegExpExecArray | null = apiPattern.exec(body);
  while (match) {
    const apiId = match[1]!;
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(body, openBrace);
    const apiBody = body.slice(openBrace + 1, closeBrace);
    const prefix = body.slice(0, match.index);
    const modifierLines = prefix.split("\n").slice(-12);
    const modifiers = parseEndpointModifiers(modifierLines);
    endpoints.push(parseApiBlock(apiId, apiBody, modifiers, serviceName));
    match = apiPattern.exec(body);
  }

  const guideBlock = collectTagBlocks(body, "guide").find((b) => b.id === "service");
  const guide = guideBlock ? proseToGuidance(extractProseLines(guideBlock.body)) : undefined;
  const description = proseToGuidance(
    extractProseLines(body.split("@api")[0] ?? "").filter((line) => line.length > 0),
  );

  return {
    name: serviceName,
    description: typeof description === "string" ? description : description?.[0],
    flags,
    endpoints,
    scenarios: scenarios.filter((s) => s.service === serviceName),
    guide,
  };
}

function parseModuleBody(moduleName: string, body: string, scenarios: ScenarioDecl[]): V2Module {
  const actors = collectTagBlocks(body, "actor").map((block) => {
    const roleMatch = /role:\s*(\w+)/.exec(block.body);
    const capsMatch = /capabilities:\s*\[([^\]]+)\]/.exec(block.body);
    return {
      id: block.id ?? "actor",
      role: roleMatch?.[1] ?? block.id ?? "Actor",
      capabilities: capsMatch ? parseBracketList(`[${capsMatch[1]}]`) : [],
    };
  });

  const rules = collectTagBlocks(body, "rule")
    .filter((block) => !body.includes(`model {`) || block.start < (body.indexOf("model {") ?? Infinity))
    .map((block) => ({
      id: block.id ?? "rule",
      text: proseToText(extractProseLines(block.body)) ?? block.id ?? "",
    }))
    .filter((rule) => rule.text.length > 0);

  const config: Record<string, Record<string, V2ConfigEntry>> = {};
  for (const block of collectTagBlocks(body, "config")) {
    const profileName = block.id ?? "default";
    config[profileName] = {};
    const entryPattern = /([\w]+):\s*\{/g;
    let entryMatch: RegExpExecArray | null = entryPattern.exec(block.body);
    while (entryMatch) {
      const key = entryMatch[1]!;
      const open = entryMatch.index + entryMatch[0].length - 1;
      const close = findMatchingBrace(block.body, open);
      const entryBody = block.body.slice(open + 1, close);
      config[profileName]![key] = {
        required: /required:\s*true/.test(entryBody) ? true : /required:\s*false/.test(entryBody) ? false : undefined,
        secret: /secret:\s*true/.test(entryBody) ? true : undefined,
        default: /default:\s*"([^"]+)"/.exec(entryBody)?.[1],
        description: proseToGuidance(extractProseLines(entryBody)),
      };
      entryMatch = entryPattern.exec(block.body);
    }
  }

  const errors: Record<string, V2ErrorDef> = {};
  for (const block of collectTagBlocks(body, "errors")) {
    const entryPattern = /(\w+):\s*\{/g;
    let entryMatch: RegExpExecArray | null = entryPattern.exec(block.body);
    while (entryMatch) {
      const key = entryMatch[1]!;
      const open = entryMatch.index + entryMatch[0].length - 1;
      const close = findMatchingBrace(block.body, open);
      const entryBody = block.body.slice(open + 1, close);
      const status = Number.parseInt(/status:\s*(\d+)/.exec(entryBody)?.[1] ?? "500", 10);
      const code = /code:\s*(\w+)/.exec(entryBody)?.[1] ?? key.toUpperCase();
      const message = stripFieldValue(/message:\s*("[^"]+"|\S+)/.exec(entryBody)?.[1] ?? key);
      errors[key] = { status, code, message };
      entryMatch = entryPattern.exec(block.body);
    }
  }

  const events = collectTagBlocks(body, "event").map((block) => ({
    id: block.id ?? "event",
    payload: /payload:\s*(\w+)/.exec(block.body)?.[1],
    handler: /handler:\s*([\w.]+)/.exec(block.body)?.[1],
        description: proseToText(extractProseLines(block.body)),
  }));

  const integrations = collectTagBlocks(body, "integration").map((block) => ({
    name: block.id ?? "integration",
    direction: normalizeDirection(/direction:\s*(\w+)/.exec(block.body)?.[1] ?? "inbound"),
    authType: normalizeAuthType(/type:\s*(\w+)/.exec(block.body)?.[1] ?? "none"),
    authEnv: /env:\s*(\w+)/.exec(block.body)?.[1],
    mapsTo: stripFieldValue(/maps_to:\s*("[^"]+"|\S+)/.exec(block.body)?.[1] ?? ""),
    purpose: proseToGuidance(extractProseLines(block.body)),
  }));

  const observeBlock = collectTagBlocks(body, "observe")[0];
  const observeSlos: V2Module["observeSlos"] = [];
  if (observeBlock) {
    const sloPattern = /\{\s*service:\s*(\w+),\s*metric:\s*([\w_]+),\s*target:\s*"([^"]+)"\s*\}/g;
    let sloMatch: RegExpExecArray | null = sloPattern.exec(observeBlock.body);
    while (sloMatch) {
      observeSlos.push({
        service: sloMatch[1]!,
        metric: sloMatch[2]!,
        target: sloMatch[3]!,
      });
      sloMatch = sloPattern.exec(observeBlock.body);
    }
  }

  const modelBlock = extractBlockAfter(body, /model\s*\{/);
  const enums: V2Enum[] = [];
  const entities: V2Entity[] = [];
  const relations: V2Relation[] = [];
  const stateMachines: V2StateMachine[] = [];
  const modelRules: V2Rule[] = [];

  if (modelBlock) {
    for (const block of collectTagBlocks(modelBlock.body, "enum")) {
      const valuesMatch = /values:\s*\[([^\]]+)\]/.exec(block.body);
      enums.push({
        name: block.id ?? "Enum",
        values: valuesMatch ? parseBracketList(`[${valuesMatch[1]}]`) : [],
      });
    }

    for (const block of collectTagBlocks(modelBlock.body, "entity")) {
      entities.push(parseEntityBlock(block.body, block.id ?? "Entity"));
    }

    for (const block of collectTagBlocks(modelBlock.body, "relation")) {
      relations.push({
        id: block.id ?? "relation",
        from: /from:\s*(\w+)/.exec(block.body)?.[1] ?? "",
        to: /to:\s*(\w+)/.exec(block.body)?.[1] ?? "",
        verb: /verb:\s*(\w+)/.exec(block.body)?.[1],
        cardinality: /cardinality:\s*(\w+)/.exec(block.body)?.[1],
      });
    }

    for (const block of collectTagBlocks(modelBlock.body, "states")) {
      const entity = /entity:\s*([\w.]+)/.exec(block.body)?.[1] ?? "";
      const transitions: Array<{ from: string; to: string }> = [];
      const transitionPattern = /\{\s*from:\s*(\w+),\s*to:\s*(\w+)\s*\}/g;
      let transitionMatch: RegExpExecArray | null = transitionPattern.exec(block.body);
      while (transitionMatch) {
        transitions.push({ from: transitionMatch[1]!, to: transitionMatch[2]! });
        transitionMatch = transitionPattern.exec(block.body);
      }
      stateMachines.push({ id: block.id ?? "states", entity, transitions });
    }

    modelRules.push(
      ...collectTagBlocks(modelBlock.body, "rule").map((block) => ({
        id: block.id ?? "rule",
        text: proseToText(extractProseLines(block.body)) ?? "",
      })),
    );
  }

  const services: V2Service[] = [];
  const servicePattern = /\bservice\s+([A-Za-z][\w]*)\s*\{/g;
  let serviceMatch: RegExpExecArray | null = servicePattern.exec(body);
  while (serviceMatch) {
    const serviceName = serviceMatch[1]!;
    const openBrace = serviceMatch.index + serviceMatch[0].length - 1;
    const closeBrace = findMatchingBrace(body, openBrace);
    const serviceBody = body.slice(openBrace + 1, closeBrace);
    services.push(parseServiceBody(serviceName, serviceBody, scenarios));
    serviceMatch = servicePattern.exec(body);
  }

  return {
    name: moduleName,
    actors,
    rules,
    config,
    errors,
    events,
    integrations,
    observeSlos,
    enums,
    entities,
    relations,
    stateMachines,
    modelRules,
    services,
  };
}

export function extractV2Kernel(source: string): V2KernelProgram {
  const versionMatch = /^\s*pactia\s+([0-9]+(?:\.[0-9]+)?)/m.exec(source);
  const version = versionMatch?.[1] ?? "1.0";

  const imports: string[] = [];
  const importPattern = /import\s+(@[\w/-]+);/g;
  let importMatch: RegExpExecArray | null = importPattern.exec(source);
  while (importMatch) {
    imports.push(importMatch[1]!);
    importMatch = importPattern.exec(source);
  }

  const productBlock = extractBlockAfter(source, /product\s+(\w+)\s*\{/);
  if (!productBlock) {
    throw new Error("Missing product block");
  }

  const productProse = proseToGuidance(extractProseLines(productBlock.body.split("module")[0] ?? ""));
  const stackMatch = /@stack\s+([\w-]+)/.exec(productBlock.body);
  const topologyBlock = collectTagBlocks(productBlock.body, "topology")[0];
  const tenancyBlock = collectTagBlocks(productBlock.body, "tenancy")[0];
  const guideBlock = collectTagBlocks(productBlock.body, "guide")[0];
  const deployBlock = collectTagBlocks(productBlock.body, "deploy")[0];

  const environments: V2DeployEnvironment[] = [];
  const gates: V2DeployGate[] = [];
  if (deployBlock) {
    for (const env of collectTagBlocks(deployBlock.body, "environment")) {
      environments.push({
        id: env.id ?? "environment",
        replicas: Number.parseInt(/replicas:\s*(\d+)/.exec(env.body)?.[1] ?? "0", 10) || undefined,
        region: /region:\s*"([^"]+)"/.exec(env.body)?.[1],
      });
    }
    for (const gate of collectTagBlocks(deployBlock.body, "gate")) {
      gates.push({
        id: gate.id ?? "gate",
        scenarios: /scenarios:\s*(\w+)/.exec(gate.body)?.[1],
        coverage: stripFieldValue(/coverage:\s*("[^"]+"|\S+)/.exec(gate.body)?.[1] ?? ""),
      });
    }
  }

  const scenarios = extractV2Tests(source);
  const modules: V2Module[] = [];
  const modulePattern = /module\s+(\w+)\s*\{/g;
  let moduleMatch: RegExpExecArray | null = modulePattern.exec(source);
  while (moduleMatch) {
    const moduleName = moduleMatch[1]!;
    const openBrace = moduleMatch.index + moduleMatch[0].length - 1;
    const closeBrace = findMatchingBrace(source, openBrace);
    const moduleBody = source.slice(openBrace + 1, closeBrace);
    modules.push(parseModuleBody(moduleName, moduleBody, scenarios));
    moduleMatch = modulePattern.exec(source);
  }

  const surfaces: V2Surface[] = modules.flatMap((mod) =>
    mod.services.flatMap((svc) => svc.endpoints.flatMap((ep) => ep.surfaces)),
  );

  return {
    version,
    imports,
    product: {
      name: productBlock.id,
      description: typeof productProse === "string" ? productProse : productProse?.[0],
      stackPackage: stackMatch?.[1] ?? "rust-anb",
      topologyMode: topologyBlock
        ? normalizeTopologyMode(/mode:\s*(\w+)/.exec(topologyBlock.body)?.[1] ?? "")
        : undefined,
      tenancyMode: tenancyBlock
        ? normalizeTenancyMode(/mode:\s*(\w+)/.exec(tenancyBlock.body)?.[1] ?? "")
        : undefined,
      guide: guideBlock ? proseToGuidance(extractProseLines(guideBlock.body)) : undefined,
      deployId: deployBlock?.id,
      environments,
      gates,
      surfaces,
    },
    modules,
  };
}
