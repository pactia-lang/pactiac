import type { Diagnostic } from "../../diagnostics/diagnostic.js";
import { Provenance } from "../../diagnostics/diagnostic.js";
import type {
  KernelEntity,
  KernelEnum,
  KernelModule,
  KernelProgram,
  KernelStateMachine,
} from "../kernel/extract.js";

export enum StateGraphErrorCode {
  BindingInvalid = "STATE_BINDING_INVALID",
  DuplicateTransition = "STATE_DUPLICATE_TRANSITION",
  MachineDuplicate = "STATE_MACHINE_DUPLICATE",
  TransitionUndefined = "STATE_TRANSITION_UNDEFINED",
}

interface ParsedEntityField {
  readonly entityName: string;
  readonly fieldName: string;
}

interface ResolvedStateMachine {
  readonly machine: KernelStateMachine;
  readonly entityField: ParsedEntityField;
  readonly enumName: string;
  readonly enumValues: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
}

function edgeKey(from: string, to: string): string {
  return `${from}\0${to}`;
}

function parseEntityField(entityRef: string): ParsedEntityField | undefined {
  const match = /^(\w+)\.(\w+)$/.exec(entityRef);
  if (!match) return undefined;
  return { entityName: match[1]!, fieldName: match[2]! };
}

function findEntity(entities: readonly KernelEntity[], name: string): KernelEntity | undefined {
  return entities.find((entity) => entity.name === name);
}

function findEnumForFieldType(enums: readonly KernelEnum[], fieldType: string): KernelEnum | undefined {
  const normalized = fieldType.toUpperCase();
  return enums.find((enumDef) => enumDef.name.toUpperCase() === normalized);
}

function resolveEnumForField(
  entities: readonly KernelEntity[],
  enums: readonly KernelEnum[],
  entityField: ParsedEntityField,
): { enumName: string; enumValues: ReadonlySet<string> } | undefined {
  const entity = findEntity(entities, entityField.entityName);
  if (!entity) return undefined;

  const field = entity.fields.find((candidate) => candidate.name === entityField.fieldName);
  if (!field) return undefined;

  const enumDef = findEnumForFieldType(enums, field.type);
  if (!enumDef) return undefined;

  return {
    enumName: enumDef.name,
    enumValues: new Set(enumDef.values),
  };
}

function resolveStateMachine(
  mod: KernelModule,
  machine: KernelStateMachine,
  diagnostics: Diagnostic[],
): ResolvedStateMachine | undefined {
  const target = `states.${machine.id}`;
  const entityField = parseEntityField(machine.entity);
  if (!entityField) {
    diagnostics.push({
      provenance: Provenance.NotDerivable,
      target,
      message: `${StateGraphErrorCode.BindingInvalid}: @states ${machine.id} entity must be Entity.field`,
    });
    return undefined;
  }

  const enumBinding = resolveEnumForField(mod.entities, mod.enums, entityField);
  if (!enumBinding) {
    diagnostics.push({
      provenance: Provenance.NotDerivable,
      target,
      message: `${StateGraphErrorCode.BindingInvalid}: @states ${machine.id} entity ${machine.entity} does not resolve to an enum field`,
    });
    return undefined;
  }

  const edges = new Set<string>();
  const seen = new Set<string>();

  for (const transition of machine.transitions) {
    if (!enumBinding.enumValues.has(transition.from) || !enumBinding.enumValues.has(transition.to)) {
      diagnostics.push({
        provenance: Provenance.NotDerivable,
        target,
        message: `${StateGraphErrorCode.BindingInvalid}: @states ${machine.id} transition ${transition.from} → ${transition.to} uses values outside ${enumBinding.enumName}`,
      });
      continue;
    }

    const key = edgeKey(transition.from, transition.to);
    if (seen.has(key)) {
      diagnostics.push({
        provenance: Provenance.NotDerivable,
        target,
        message: `${StateGraphErrorCode.DuplicateTransition}: @states ${machine.id} repeats edge ${transition.from} → ${transition.to}`,
      });
      continue;
    }
    seen.add(key);
    edges.add(key);
  }

  return {
    machine,
    entityField,
    enumName: enumBinding.enumName,
    enumValues: enumBinding.enumValues,
    edges,
  };
}

function validateModuleStateGraphs(mod: KernelModule): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const resolved: ResolvedStateMachine[] = [];
  const bindings = new Map<string, string>();

  for (const machine of mod.stateMachines) {
    const bindingKey = machine.entity;
    const existingId = bindings.get(bindingKey);
    if (existingId) {
      diagnostics.push({
        provenance: Provenance.NotDerivable,
        target: `states.${machine.id}`,
        message: `${StateGraphErrorCode.MachineDuplicate}: @states ${machine.id} and @states ${existingId} both bind ${bindingKey}`,
      });
    } else {
      bindings.set(bindingKey, machine.id);
    }

    const resolvedMachine = resolveStateMachine(mod, machine, diagnostics);
    if (resolvedMachine) resolved.push(resolvedMachine);
  }

  const allEdges = new Set<string>();
  for (const machine of resolved) {
    for (const edge of machine.edges) {
      allEdges.add(edge);
    }
  }

  for (const service of mod.services) {
    for (const endpoint of service.endpoints) {
      if (!endpoint.transition) continue;

      const { from, to } = endpoint.transition;
      const target = `api.${endpoint.id}.transition`;
      const key = edgeKey(from, to);

      const validValues = resolved.some(
        (machine) => machine.enumValues.has(from) && machine.enumValues.has(to),
      );
      if (!validValues) {
        diagnostics.push({
          provenance: Provenance.NotDerivable,
          target,
          message: `${StateGraphErrorCode.BindingInvalid}: @transition on @api ${endpoint.id} uses values not in any module state enum`,
        });
        continue;
      }

      if (!allEdges.has(key)) {
        diagnostics.push({
          provenance: Provenance.NotDerivable,
          target,
          message: `${StateGraphErrorCode.TransitionUndefined}: @transition on @api ${endpoint.id} declares ${from} → ${to} but no @states block defines that edge`,
        });
      }
    }
  }

  return diagnostics;
}

/** Phase-10 validation: @states graphs and @transition edges against module enums. */
export function validateStateGraphs(program: KernelProgram): Diagnostic[] {
  return program.modules.flatMap((mod) => validateModuleStateGraphs(mod));
}
