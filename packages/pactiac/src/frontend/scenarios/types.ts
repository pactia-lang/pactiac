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
