import { ScenarioOwnership, ScenarioProvenance } from "../../domain/provenance.js";

export interface ScenarioStep {
  readonly kind: "given" | "when" | "then" | "and";
  readonly text: string;
}

export interface ScenarioDecl {
  readonly id?: string;
  readonly name: string;
  readonly steps: ScenarioStep[];
  readonly service?: string;
  readonly whenText?: string;
  readonly thenText?: string;
}

export interface MustDecl {
  readonly id?: string;
  readonly on?: string;
  readonly lines?: string[];
  readonly text?: string;
  readonly service: string;
}

export interface ScenarioGiven {
  actor?: string;
  auth?: string;
  ownership?: ScenarioOwnership;
}

export interface ScenarioWhen {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

export interface ScenarioThenInput {
  httpStatus?: string;
  bodyRef?: string;
  kafkaEmits?: string;
  text?: string;
}

export interface ScenarioEntry {
  readonly id?: string;
  readonly name: string;
  readonly service?: string;
  readonly provenance?: ScenarioProvenance;
  readonly given?: ScenarioGiven;
  readonly when?: ScenarioWhen;
  readonly then?: ScenarioThenInput;
  readonly text?: string | { readonly when: string; readonly then: string };
}

export interface ScenariosInput {
  readonly scenarios: readonly ScenarioEntry[];
}

export { ScenarioOwnership, ScenarioProvenance };
