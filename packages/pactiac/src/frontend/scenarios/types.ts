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
