import {
  type ActorDecl,
  ConfigEntryKind,
  type ConfigDecl,
  type ConfigEntry,
  type ModelDecl,
  type DtoDecl,
  type DtoFieldDecl,
  type EndpointDecl,
  type EntityDecl,
  type EntityFieldDecl,
  type EnumDecl,
  type ErrorDecl,
  type EventDecl,
  type IntegrationDecl,
  type InvariantDecl,
  type ModuleDecl,
  type PackageImport,
  type PolicyDecl,
  type ProductDecl,
  type RelationDecl,
  RelationVerb,
  type RetentionRule,
  type ScenarioDecl,
  type ScenarioStep,
  type PactiaProgram,
  type ServiceDecl,
  type StateMachineDecl,
  type StateTransition,
  type TypeRef,
  type WhenBinding,
  type WorkflowDecl,
} from "./ast.js";
import { PactiaSyntaxError, type Token, TokenType, tokenize } from "./tokens.js";

const HTTP_METHODS: ReadonlySet<string> = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/**
 * Recursive-descent parser for the Pactia kernel subset. It is total and
 * deterministic: it never calls an LLM and never guesses. Anything it cannot
 * parse is a hard PactiaSyntaxError, not a silent recovery.
 */
class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.eofToken();
  }

  private eofToken(): Token {
    const last = this.tokens[this.tokens.length - 1];
    return last ?? { type: TokenType.EOF, value: "", line: 0, col: 0 };
  }

  private next(): Token {
    const token = this.peek();
    if (token.type !== TokenType.EOF) this.pos += 1;
    return token;
  }

  private isKeyword(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.type === TokenType.IDENT && token.value === value;
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new PactiaSyntaxError(
        `Expected ${type} but found ${token.type} '${token.value}'`,
        token.line,
        token.col,
      );
    }
    return this.next();
  }

  private expectKeyword(value: string): Token {
    const token = this.peek();
    if (token.type !== TokenType.IDENT || token.value !== value) {
      throw new PactiaSyntaxError(
        `Expected keyword '${value}' but found '${token.value}'`,
        token.line,
        token.col,
      );
    }
    return this.next();
  }

  private ident(): string {
    return this.expect(TokenType.IDENT).value;
  }

  private string(): string {
    return this.expect(TokenType.STRING).value;
  }

  parseProgram(): PactiaProgram {
    let version = "1.1";
    if (this.isKeyword("pactia")) {
      this.next();
      version = this.expect(TokenType.NUMBER).value;
    }

    let product: ProductDecl | undefined;
    const packageImports: PackageImport[] = [];
    const localImports: string[] = [];
    const modules: ModuleDecl[] = [];

    while (this.peek().type !== TokenType.EOF) {
      const token = this.peek();
      if (token.type !== TokenType.IDENT) {
        throw new PactiaSyntaxError(
          `Unexpected ${token.type} '${token.value}' at top level`,
          token.line,
          token.col,
        );
      }
      switch (token.value) {
        case "use":
          packageImports.push(this.parseUse());
          break;
        case "import":
          this.next();
          localImports.push(this.string());
          break;
        case "product":
          product = this.parseProduct();
          break;
        case "module":
          modules.push(this.parseModule());
          break;
        default:
          throw new PactiaSyntaxError(
            `Unknown top-level declaration '${token.value}' — declarations must live inside module { }`,
            token.line,
            token.col,
          );
      }
    }

    if (!product) {
      throw new PactiaSyntaxError("Program must declare a product", 0, 0);
    }

    return {
      version,
      product,
      packageImports,
      localImports,
      modules,
    };
  }

  private parseModule(): ModuleDecl {
    this.expectKeyword("module");
    const name = this.ident();
    this.expect(TokenType.LBRACE);

    const actors: ActorDecl[] = [];
    const rules: string[] = [];
    const constraints: string[] = [];
    const workflows: WorkflowDecl[] = [];
    const dtos: DtoDecl[] = [];
    let model: ModelDecl | undefined;
    const services: ServiceDecl[] = [];
    const integrations: IntegrationDecl[] = [];
    const whenBindings: WhenBinding[] = [];
    let policy: PolicyDecl | undefined;
    const errors: ErrorDecl[] = [];
    const events: EventDecl[] = [];
    let config: ConfigDecl | undefined;
    const scenarios: ScenarioDecl[] = [];

    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const token = this.peek();
      if (token.type !== TokenType.IDENT) {
        throw new PactiaSyntaxError(
          `Unexpected ${token.type} '${token.value}' inside module '${name}'`,
          token.line,
          token.col,
        );
      }
      switch (token.value) {
        case "actor":
          actors.push(this.parseActor());
          break;
        case "rule":
          this.next();
          rules.push(this.string());
          break;
        case "constraint":
          this.next();
          constraints.push(this.string());
          break;
        case "workflow":
          workflows.push(this.parseWorkflow());
          break;
        case "dto":
          dtos.push(this.parseDto());
          break;
        case "model":
          model = this.parseModel();
          break;
        case "service":
          services.push(this.parseService());
          break;
        case "integration":
          integrations.push(this.parseIntegration());
          break;
        case "when":
          whenBindings.push(this.parseWhen());
          break;
        case "policy":
          policy = this.parsePolicy();
          break;
        case "error":
          errors.push(this.parseError());
          break;
        case "event":
          events.push(this.parseEvent());
          break;
        case "config":
          config = this.parseConfig();
          break;
        case "scenario":
          scenarios.push(this.parseScenario());
          break;
        default:
          throw new PactiaSyntaxError(
            `Unknown declaration '${token.value}' inside module '${name}'`,
            token.line,
            token.col,
          );
      }
    }
    this.expect(TokenType.RBRACE);

    return {
      name,
      actors,
      rules,
      constraints,
      workflows,
      dtos,
      model,
      services,
      integrations,
      whenBindings,
      policy,
      errors,
      events,
      config,
      scenarios,
    };
  }

  private parseUse(): PackageImport {
    this.expectKeyword("use");
    this.expectKeyword("package");
    const coordinate = this.ident();
    let version: string | undefined;
    if (this.peek().type === TokenType.CARET) {
      this.next();
      version = `^${this.expect(TokenType.NUMBER).value}`;
    } else if (this.peek().type === TokenType.NUMBER) {
      version = this.expect(TokenType.NUMBER).value;
    }
    // Optional `from <registry>` clause.
    if (this.isKeyword("from")) {
      this.next();
      this.ident();
    }
    return { coordinate, version };
  }

  private parseProduct(): ProductDecl {
    this.expectKeyword("product");
    const name = this.ident();
    this.expect(TokenType.LBRACE);

    let description: string | undefined;
    if (this.peek().type === TokenType.STRING) description = this.string();

    let stackId = "";
    let stackVersion: string | undefined;
    let topology: string | undefined;
    let tenancy: string | undefined;

    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const option = this.ident();
      switch (option) {
        case "stack":
          stackId = this.ident();
          if (this.peek().type === TokenType.CARET) {
            this.next();
            stackVersion = `^${this.expect(TokenType.NUMBER).value}`;
          } else if (this.peek().type === TokenType.NUMBER) {
            stackVersion = this.expect(TokenType.NUMBER).value;
          }
          break;
        case "topology":
          topology = this.ident();
          break;
        case "tenancy":
          tenancy = this.ident();
          break;
        default:
          throw new PactiaSyntaxError(
            `Unknown product option '${option}'`,
            this.peek().line,
            this.peek().col,
          );
      }
    }
    this.expect(TokenType.RBRACE);

    return { name, description, stackId, stackVersion, topology, tenancy };
  }

  private parseActor(): ActorDecl {
    this.expectKeyword("actor");
    const name = this.ident();
    this.expect(TokenType.LBRACE);
    const capabilities: string[] = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const words: string[] = [this.ident()];
      while (this.peek().type === TokenType.IDENT) words.push(this.ident());
      capabilities.push(words.join(" "));
      if (this.peek().type === TokenType.COMMA) this.next();
    }
    this.expect(TokenType.RBRACE);
    return { name, capabilities };
  }

  private parseWorkflow(): WorkflowDecl {
    this.expectKeyword("workflow");
    const name = this.ident();
    this.expectKeyword("by");
    const actor = this.ident();
    this.expect(TokenType.LBRACE);
    const steps: string[] = [this.ident()];
    while (this.peek().type === TokenType.ARROW) {
      this.next();
      steps.push(this.ident());
    }
    this.expect(TokenType.RBRACE);
    return { name, actor, steps };
  }

  private parseTypeRef(): TypeRef {
    const name = this.ident();
    let array = false;
    if (this.peek().type === TokenType.LBRACKET && this.peek(1).type === TokenType.RBRACKET) {
      this.next();
      this.next();
      array = true;
    }
    return { name, array };
  }

  private parseDto(): DtoDecl {
    this.expectKeyword("dto");
    const name = this.ident();
    this.expect(TokenType.LBRACE);
    const fields: DtoFieldDecl[] = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const fieldName = this.ident();
      let optional = false;
      if (this.peek().type === TokenType.QUESTION) {
        this.next();
        optional = true;
      }
      this.expect(TokenType.COLON);
      const type = this.parseTypeRef();
      fields.push({ name: fieldName, type, optional });
      if (this.peek().type === TokenType.COMMA) this.next();
    }
    this.expect(TokenType.RBRACE);
    return { name, fields };
  }

  private parseModel(): ModelDecl {
    this.expectKeyword("model");
    const name = this.peek().type === TokenType.IDENT ? this.ident() : "";
    this.expect(TokenType.LBRACE);
    const enums: EnumDecl[] = [];
    const entities: EntityDecl[] = [];
    const relations: RelationDecl[] = [];
    const stateMachines: StateMachineDecl[] = [];
    const invariants: InvariantDecl[] = [];

    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      if (this.isKeyword("enum")) {
        enums.push(this.parseEnum());
      } else if (this.isKeyword("entity")) {
        entities.push(this.parseEntity());
      } else if (this.isKeyword("statemachine")) {
        stateMachines.push(this.parseStateMachine());
      } else if (this.isKeyword("invariant")) {
        invariants.push(this.parseInvariant());
      } else {
        relations.push(this.parseRelation());
      }
    }
    this.expect(TokenType.RBRACE);
    return { name, enums, entities, relations, stateMachines, invariants };
  }

  private parseStateExpr(): string {
    if (this.peek().type === TokenType.STAR) {
      this.next();
      return "*";
    }
    return this.ident();
  }

  private parseStateMachine(): StateMachineDecl {
    this.expectKeyword("statemachine");
    const name = this.ident();
    this.expectKeyword("on");
    const entity = this.ident();
    this.expect(TokenType.LBRACE);
    const transitions: StateTransition[] = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const from = this.parseStateExpr();
      this.expect(TokenType.ARROW);
      const to = this.parseStateExpr();
      transitions.push({ from, to });
      if (this.peek().type === TokenType.COMMA) this.next();
    }
    this.expect(TokenType.RBRACE);
    return { name, entity, transitions };
  }

  private parseEnum(): EnumDecl {
    this.expectKeyword("enum");
    const name = this.ident();
    this.expect(TokenType.LBRACE);
    const values: string[] = [this.ident()];
    while (this.peek().type === TokenType.COMMA) {
      this.next();
      if (this.peek().type === TokenType.RBRACE) break;
      values.push(this.ident());
    }
    this.expect(TokenType.RBRACE);
    return { name, values };
  }

  private parseEntity(): EntityDecl {
    this.expectKeyword("entity");
    const name = this.ident();
    this.expect(TokenType.LBRACE);
    const fields: EntityFieldDecl[] = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const fieldName = this.ident();
      this.expect(TokenType.COLON);
      const typeName = this.ident();
      const annotations: string[] = [];
      if (this.peek().type === TokenType.LBRACKET) {
        this.next();
        while (this.peek().type !== TokenType.RBRACKET && this.peek().type !== TokenType.EOF) {
          annotations.push(this.ident());
          if (this.peek().type === TokenType.COMMA) this.next();
        }
        this.expect(TokenType.RBRACKET);
      }
      fields.push({ name: fieldName, type: { name: typeName, array: false }, annotations });
      if (this.peek().type === TokenType.COMMA) this.next();
    }
    this.expect(TokenType.RBRACE);
    return { name, fields };
  }

  private parseRelation(): RelationDecl {
    const from = this.ident();
    const verbWord = this.ident();
    let verb: RelationVerb;
    if (verbWord === "owns") {
      this.expectKeyword("many");
      verb = RelationVerb.OWNS_MANY;
    } else if (verbWord === "has") {
      const card = this.ident();
      if (card === "many") verb = RelationVerb.HAS_MANY;
      else if (card === "one") verb = RelationVerb.HAS_ONE;
      else
        throw new PactiaSyntaxError(
          `Expected 'many' or 'one' after 'has'`,
          this.peek().line,
          this.peek().col,
        );
    } else if (verbWord === "belongs") {
      this.expectKeyword("to");
      verb = RelationVerb.BELONGS_TO;
    } else {
      throw new PactiaSyntaxError(
        `Unknown relation verb '${verbWord}'`,
        this.peek().line,
        this.peek().col,
      );
    }
    const to = this.ident();
    return { from, to, verb };
  }

  private parseInvariant(): InvariantDecl {
    this.expectKeyword("invariant");
    const id = this.ident();
    this.expect(TokenType.LBRACE);
    const description = this.string();
    this.expectKeyword("entities");
    const entities: string[] = [this.ident()];
    while (this.peek().type === TokenType.COMMA) {
      this.next();
      entities.push(this.ident());
    }
    this.expect(TokenType.RBRACE);
    return { id, description, entities };
  }

  private parseService(): ServiceDecl {
    this.expectKeyword("service");
    const name = this.ident();
    let description: string | undefined;
    if (this.peek().type === TokenType.STRING) description = this.string();
    this.expect(TokenType.LBRACE);

    let database = false;
    let cache = false;
    let events = false;
    const endpoints: EndpointDecl[] = [];

    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const token = this.peek();
      if (token.type === TokenType.IDENT && HTTP_METHODS.has(token.value)) {
        endpoints.push(this.parseEndpoint());
        continue;
      }
      const option = this.ident();
      switch (option) {
        case "database":
          database = this.parseBoolean();
          break;
        case "cache":
          cache = this.parseBoolean();
          break;
        case "events":
          events = this.parseBoolean();
          break;
        default:
          throw new PactiaSyntaxError(
            `Unknown service option '${option}'`,
            token.line,
            token.col,
          );
      }
    }
    this.expect(TokenType.RBRACE);
    return { name, description, database, cache, events, endpoints };
  }

  private parseBoolean(): boolean {
    const value = this.ident();
    if (value === "true") return true;
    if (value === "false") return false;
    throw new PactiaSyntaxError(
      `Expected 'true' or 'false' but found '${value}'`,
      this.peek().line,
      this.peek().col,
    );
  }

  private parseEndpoint(): EndpointDecl {
    const method = this.ident();
    const path = this.expect(TokenType.PATH).value;

    const roles: string[] = [];
    let isPublic = false;
    let publicFrom: string | undefined;

    if (this.isKeyword("for")) {
      this.next();
      roles.push(this.ident());
      while (this.peek().type === TokenType.COMMA) {
        this.next();
        roles.push(this.ident());
      }
    } else if (this.isKeyword("public")) {
      this.next();
      isPublic = true;
      if (this.isKeyword("from")) {
        this.next();
        publicFrom = this.ident();
      }
    } else {
      throw new PactiaSyntaxError(
        `Endpoint must declare 'for <roles>' or 'public'`,
        this.peek().line,
        this.peek().col,
      );
    }

    const modifiers: string[] = [];
    let partyRole: string | undefined;
    let transition: { from: string; to: string } | undefined;
    const emits: string[] = [];

    if (this.peek().type === TokenType.LBRACKET) {
      this.next();
      while (this.peek().type !== TokenType.RBRACKET && this.peek().type !== TokenType.EOF) {
        const word = this.ident();
        if (word === "as") {
          partyRole = this.ident();
        } else if (word === "transition") {
          const fromState = this.parseStateExpr();
          this.expect(TokenType.ARROW);
          const toState = this.parseStateExpr();
          transition = { from: fromState, to: toState };
        } else if (word === "emits") {
          emits.push(this.ident());
        } else {
          modifiers.push(word);
        }
        if (this.peek().type === TokenType.COMMA) this.next();
      }
      this.expect(TokenType.RBRACKET);
    }

    let body: string | undefined;
    let response: string | undefined;
    const endpointErrors: string[] = [];
    while (this.isKeyword("body") || this.isKeyword("response") || this.isKeyword("errors")) {
      const which = this.ident();
      if (which === "body") {
        body = this.ident();
      } else if (which === "response") {
        response = this.ident();
      } else {
        // "errors" — comma-separated list of error names
        endpointErrors.push(this.ident());
        while (this.peek().type === TokenType.COMMA) {
          this.next();
          endpointErrors.push(this.ident());
        }
      }
    }

    return {
      method,
      path,
      roles,
      modifiers,
      partyRole,
      transition,
      emits,
      publicFrom,
      isPublic,
      body,
      response,
      errors: endpointErrors,
    };
  }

  private parseIntegration(): IntegrationDecl {
    this.expectKeyword("integration");
    const name = this.ident();
    const direction = this.ident();
    const authType = this.ident();
    let authHeader: string | undefined;
    if (this.peek().type === TokenType.IDENT && !this.isKeyword("maps")) {
      // header name follows api_key / hmac
      if (this.peek().type === TokenType.IDENT) authHeader = this.ident();
    }
    this.expect(TokenType.LBRACE);
    let purpose: string | undefined;
    if (this.peek().type === TokenType.STRING) purpose = this.string();
    let mapsTo: { method: string; path: string } | undefined;
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      if (this.isKeyword("maps")) {
        this.next();
        this.expectKeyword("to");
        const method = this.ident();
        const path = this.expect(TokenType.PATH).value;
        mapsTo = { method, path };
      } else {
        const stray = this.peek();
        throw new PactiaSyntaxError(
          `Unexpected '${stray.value}' in integration body`,
          stray.line,
          stray.col,
        );
      }
    }
    this.expect(TokenType.RBRACE);
    return { name, direction, authType, authHeader, purpose, mapsTo };
  }

  private parseWhen(): WhenBinding {
    this.expectKeyword("when");
    // `when <subject> <verb...> -> Service.handler`
    // The subject is the first word; remaining words form the underscored verb,
    // producing a dotted event name (e.g. `trade payment sent` -> `trade.payment_sent`).
    const subject = this.ident();
    const verbWords: string[] = [];
    while (this.peek().type === TokenType.IDENT) verbWords.push(this.ident());
    if (verbWords.length === 0) {
      throw new PactiaSyntaxError(
        `'when ${subject}' must be followed by an event verb`,
        this.peek().line,
        this.peek().col,
      );
    }
    const event = `${subject}.${verbWords.join("_")}`;
    this.expect(TokenType.ARROW);
    const target = this.ident();
    const dotIndex = target.indexOf(".");
    if (dotIndex < 0) {
      throw new PactiaSyntaxError(
        `'when' target must be Service.handler but found '${target}'`,
        this.peek().line,
        this.peek().col,
      );
    }
    const service = target.slice(0, dotIndex);
    const handler = target.slice(dotIndex + 1);
    return { event, service, handler };
  }

  private parsePolicy(): PolicyDecl {
    this.expectKeyword("policy");
    this.expect(TokenType.LBRACE);
    const retention: RetentionRule[] = [];
    let residency: string | undefined;
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const option = this.ident();
      if (option === "retain") {
        const entity = this.ident();
        const period = this.ident();
        let reason: string | undefined;
        if (this.peek().type === TokenType.STRING) reason = this.string();
        retention.push({ entity, period, reason });
      } else if (option === "residency") {
        residency = this.ident();
      } else {
        throw new PactiaSyntaxError(
          `Unknown policy option '${option}'`,
          this.peek().line,
          this.peek().col,
        );
      }
    }
    this.expect(TokenType.RBRACE);
    return { retention, residency };
  }

  // v1.3 parse methods ---------------------------------------------------

  /** error Name StatusCode "code-string" ["description"] */
  private parseError(): ErrorDecl {
    this.expectKeyword("error");
    const name = this.ident();
    const statusToken = this.expect(TokenType.NUMBER);
    const status = parseInt(statusToken.value, 10);
    const code = this.string();
    let description: string | undefined;
    if (this.peek().type === TokenType.STRING) description = this.string();
    return { name, status, code, description };
  }

  /** event event.name { ["description"] [payload Dto] } */
  private parseEvent(): EventDecl {
    this.expectKeyword("event");
    const name = this.ident();
    this.expect(TokenType.LBRACE);
    let description: string | undefined;
    let payloadDto: string | undefined;
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      if (this.peek().type === TokenType.STRING) {
        description = this.string();
      } else if (this.isKeyword("payload")) {
        this.next();
        payloadDto = this.ident();
      } else {
        const stray = this.peek();
        throw new PactiaSyntaxError(
          `Unexpected '${stray.value}' in event body`,
          stray.line,
          stray.col,
        );
      }
    }
    this.expect(TokenType.RBRACE);
    return { name, description, payloadDto };
  }

  /**
   * config {
   *   require KEY ["description"]
   *   require KEY secret ["description"]
   *   optional KEY default "value" ["description"]
   * }
   */
  private parseConfig(): ConfigDecl {
    this.expectKeyword("config");
    this.expect(TokenType.LBRACE);
    const entries: ConfigEntry[] = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const keyword = this.ident();
      if (keyword !== "require" && keyword !== "optional") {
        throw new PactiaSyntaxError(
          `Expected 'require' or 'optional' in config block but found '${keyword}'`,
          this.peek().line,
          this.peek().col,
        );
      }
      const kind = keyword === "require" ? ConfigEntryKind.REQUIRED : ConfigEntryKind.OPTIONAL;
      const key = this.ident();
      let secret = false;
      let defaultValue: string | undefined;
      // optional modifiers before the description string
      if (this.peek().type === TokenType.IDENT) {
        if (this.peek().value === "secret") {
          this.next();
          secret = true;
        } else if (this.peek().value === "default") {
          this.next();
          defaultValue = this.string();
        }
      }
      let description: string | undefined;
      if (this.peek().type === TokenType.STRING) description = this.string();
      entries.push({ key, kind, secret, defaultValue, description });
    }
    this.expect(TokenType.RBRACE);
    return { entries };
  }

  /**
   * scenario "name" {
   *   given <clause text>
   *   when  <clause text>
   *   then  <clause text>
   *   and   <clause text>
   * }
   * Each clause collects tokens until the next clause keyword or closing brace.
   */
  private parseScenario(): ScenarioDecl {
    this.expectKeyword("scenario");
    const name = this.string();
    this.expect(TokenType.LBRACE);

    const steps: ScenarioStep[] = [];
    const CLAUSE_KEYWORDS = new Set(["given", "when", "then", "and"]);

    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const tok = this.peek();
      if (tok.type !== TokenType.IDENT || !CLAUSE_KEYWORDS.has(tok.value)) {
        throw new PactiaSyntaxError(
          `Expected 'given', 'when', 'then', or 'and' in scenario but found '${tok.value}'`,
          tok.line,
          tok.col,
        );
      }
      const kind = tok.value as "given" | "when" | "then" | "and";
      this.next(); // consume the clause keyword

      const parts: string[] = [];
      while (
        this.peek().type !== TokenType.RBRACE &&
        this.peek().type !== TokenType.EOF &&
        !(this.peek().type === TokenType.IDENT && CLAUSE_KEYWORDS.has(this.peek().value))
      ) {
        parts.push(this.next().value);
      }

      steps.push({ kind, text: parts.join(" ") });
    }

    this.expect(TokenType.RBRACE);
    return { name, steps };
  }
}

export function parse(source: string): PactiaProgram {
  const tokens = tokenize(source);
  return new Parser(tokens).parseProgram();
}
