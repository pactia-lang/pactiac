/**
 * Typed AST for the Pactia kernel subset that the fleet reference program uses.
 * The AST is intentionally a faithful, lossless mirror of what the author
 * actually wrote — no inference happens here. Lowering reports provenance so
 * the determinable-vs-invented boundary is visible.
 */

export interface ErrorDecl {
  readonly name: string;
  readonly status: number;
  readonly code: string;
  readonly description: string | undefined;
}

export interface EventDecl {
  readonly name: string;
  readonly description: string | undefined;
  readonly payloadDto: string | undefined;
}

export enum ConfigEntryKind {
  REQUIRED = "REQUIRED",
  OPTIONAL = "OPTIONAL",
}

export interface ConfigEntry {
  readonly key: string;
  readonly kind: ConfigEntryKind;
  readonly secret: boolean;
  readonly defaultValue: string | undefined;
  readonly description: string | undefined;
}

export interface ConfigDecl {
  readonly entries: ConfigEntry[];
}

export interface ScenarioStep {
  readonly kind: "given" | "when" | "then" | "and";
  readonly text: string;
}

export interface ScenarioDecl {
  readonly name: string;
  readonly steps: ScenarioStep[];
  /** v2 — enclosing service name when parsed from `@test { }`. */
  readonly service?: string;
  /** v2 — raw When clause text. */
  readonly whenText?: string;
  /** v2 — raw Then clause text. */
  readonly thenText?: string;
}

// ---------------------------------------------------------------------------

/**
 * A named container that scopes all business declarations. Multiple modules
 * may appear in one file (multiple bounded contexts). The module name becomes
 * an addressable unit for future multi-file merging and cross-module references.
 */
export interface ModuleDecl {
  readonly name: string;
  readonly actors: ActorDecl[];
  readonly rules: string[];
  readonly constraints: string[];
  readonly workflows: WorkflowDecl[];
  readonly dtos: DtoDecl[];
  readonly model: ModelDecl | undefined;
  readonly services: ServiceDecl[];
  readonly integrations: IntegrationDecl[];
  readonly whenBindings: WhenBinding[];
  readonly policy: PolicyDecl | undefined;
  /** v1.3 — named error catalog entries */
  readonly errors: ErrorDecl[];
  /** v1.3 — typed event declarations */
  readonly events: EventDecl[];
  /** v1.3 — required/optional environment variables */
  readonly config: ConfigDecl | undefined;
  /** v1.3 — machine-readable acceptance criteria */
  readonly scenarios: ScenarioDecl[];
}

export interface PactiaProgram {
  readonly version: string;
  readonly product: ProductDecl;
  readonly packageImports: PackageImport[];
  readonly localImports: string[];
  /** Named module blocks — all kernel declarations live inside modules. */
  readonly modules: ModuleDecl[];
}

export interface PackageImport {
  readonly coordinate: string;
  readonly version: string | undefined;
}

export interface ProductDecl {
  readonly name: string;
  readonly description: string | undefined;
  readonly stackId: string;
  readonly stackVersion: string | undefined;
  readonly topology: string | undefined;
  readonly tenancy: string | undefined;
}

export interface ActorDecl {
  readonly name: string;
  readonly capabilities: string[];
}

export interface WorkflowDecl {
  readonly name: string;
  readonly actor: string;
  readonly steps: string[];
}

export interface TypeRef {
  readonly name: string;
  readonly array: boolean;
}

export interface DtoFieldDecl {
  readonly name: string;
  readonly type: TypeRef;
  readonly optional: boolean;
}

export interface DtoDecl {
  readonly name: string;
  readonly fields: DtoFieldDecl[];
}

export interface EnumDecl {
  readonly name: string;
  readonly values: string[];
}

export interface EntityFieldDecl {
  readonly name: string;
  readonly type: TypeRef;
  readonly annotations: string[];
}

export interface EntityDecl {
  readonly name: string;
  readonly fields: EntityFieldDecl[];
}

export enum RelationVerb {
  OWNS_MANY = "OWNS_MANY",
  HAS_MANY = "HAS_MANY",
  HAS_ONE = "HAS_ONE",
  BELONGS_TO = "BELONGS_TO",
}

export interface RelationDecl {
  readonly from: string;
  readonly to: string;
  readonly verb: RelationVerb;
}

export interface InvariantDecl {
  readonly id: string;
  readonly description: string;
  readonly entities: string[];
}

export interface StateTransition {
  readonly from: string;
  readonly to: string;
}

export interface StateMachineDecl {
  readonly name: string;
  readonly entity: string;
  readonly transitions: StateTransition[];
}

export interface ModelDecl {
  readonly name: string;
  readonly enums: EnumDecl[];
  readonly entities: EntityDecl[];
  readonly relations: RelationDecl[];
  readonly stateMachines: StateMachineDecl[];
  readonly invariants: InvariantDecl[];
}

export interface EndpointDecl {
  readonly method: string;
  readonly path: string;
  readonly roles: string[];
  readonly modifiers: string[];
  readonly partyRole: string | undefined;
  readonly transition: { readonly from: string; readonly to: string } | undefined;
  readonly emits: string[];
  readonly publicFrom: string | undefined;
  readonly isPublic: boolean;
  readonly body: string | undefined;
  readonly response: string | undefined;
  /** v1.3 — error names referenced from the module error catalog */
  readonly errors: string[];
}

export interface ServiceDecl {
  readonly name: string;
  readonly description: string | undefined;
  readonly database: boolean;
  readonly cache: boolean;
  readonly events: boolean;
  readonly endpoints: EndpointDecl[];
}

export interface IntegrationDecl {
  readonly name: string;
  readonly direction: string;
  readonly authType: string;
  readonly authHeader: string | undefined;
  readonly purpose: string | undefined;
  readonly mapsTo: { readonly method: string; readonly path: string } | undefined;
}

export interface WhenBinding {
  /** Dotted event name, e.g. `trade.payment_sent` (subject + underscored verb). */
  readonly event: string;
  readonly service: string;
  readonly handler: string;
}

export interface RetentionRule {
  readonly entity: string;
  readonly period: string;
  readonly reason: string | undefined;
}

export interface PolicyDecl {
  readonly retention: RetentionRule[];
  readonly residency: string | undefined;
}
