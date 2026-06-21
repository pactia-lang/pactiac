import {
  DefSigil,
  SyntaxNodeKind,
  type AttachModuleNode,
  type AttachServiceNode,
  type DefDeclNode,
  type FieldLineNode,
  type ImportNode,
  type MacroInvocationNode,
  type ModelItem,
  type ModelNode,
  type ModuleConstNode,
  type ModuleItem,
  type ModuleNode,
  type ProductItem,
  type ProductNode,
  type ProgramNode,
  type ProseNode,
  type ServiceItem,
  type ServiceNode,
  type SyntaxTree,
  type TagBlockNode,
  type TagBodyItem,
  type TagPrefixNode,
} from "../../domain/syntax-tree.js";
import { allPlacementTargets, parsePlacementTarget, type PlacementTarget } from "../../domain/placement.js";
import type { FieldSpec } from "../../domain/registry.js";
import { tokenize, TokenType, PactiaSyntaxError } from "../../frontend/lexer/tokens.js";
import type { ParseInput } from "../../ports/parser.js";
import { isMacroInvocationStart, isModifierTagToken, isTagToken, tagNameFromToken, TokenStream } from "./token-stream.js";

export function fieldSpecFromDefBody(items: readonly TagBodyItem[]): FieldSpec {
  const required: string[] = [];
  const optional: string[] = [];
  let modifier = false;

  for (const item of items) {
    if (item.kind !== SyntaxNodeKind.FieldLine) continue;
    if (item.name === "modifier" && item.required) {
      modifier = true;
      continue;
    }
    if (item.required) required.push(item.name);
    else optional.push(item.name);
  }

  return { required, optional, modifier, openExtension: true };
}

export class RecursiveDescentParser {
  parse(input: ParseInput): SyntaxTree {
    const tokens = tokenize(input.source);
    const stream = new TokenStream(tokens);
    const root = this.parseProgram(stream, input.entryFile);
    return {
      version: root.version,
      root,
      source: input.source,
      entryFile: input.entryFile,
    };
  }

  private parseProgram(stream: TokenStream, file: string): ProgramNode {
    let version = "1.0";
    if (stream.match(TokenType.IDENT, "pactia")) {
      const versionToken = stream.expect(TokenType.NUMBER, "Expected pactia version number");
      version = versionToken.value;
    }

    const imports: ImportNode[] = [];
    const exportDefs: DefDeclNode[] = [];
    const fragmentExports: ModuleNode[] = [];
    const fragmentServiceExports: ServiceNode[] = [];
    const fragmentModelExports: ModelNode[] = [];
    let product: ProductNode | undefined;

    while (!stream.atEnd()) {
      if (stream.match(TokenType.IDENT, "import")) {
        imports.push(this.parseImport(stream, file));
        continue;
      }
      if (stream.match(TokenType.IDENT, "export")) {
        if (stream.check(TokenType.IDENT, "module")) {
          fragmentExports.push(this.parseModule(stream, file));
          continue;
        }
        if (stream.check(TokenType.IDENT, "service")) {
          fragmentServiceExports.push(this.parseService(stream, file));
          continue;
        }
        if (stream.check(TokenType.IDENT, "model")) {
          fragmentModelExports.push(this.parseModel(stream, file));
          continue;
        }
        if (this.checkDefStart(stream)) {
          const def = this.parseDefDecl(stream, file, true, true);
          if (def.exported) exportDefs.push(def);
          continue;
        }
        throw new PactiaSyntaxError(
          "Expected export module, export service, export model, or export def",
          stream.peek().line,
          stream.peek().col,
        );
      }
      if (this.checkDefStart(stream)) {
        const def = this.parseDefDecl(stream, file, true);
        if (def.exported) exportDefs.push(def);
        continue;
      }
      if (stream.match(TokenType.IDENT, "product")) {
        product = this.parseProduct(stream, file);
        continue;
      }
      if (stream.check(TokenType.IDENT, "module")) {
        throw new PactiaSyntaxError("module declarations must appear inside product { }", stream.peek().line, stream.peek().col);
      }
      throw new PactiaSyntaxError(`Unexpected token '${stream.peek().value}'`, stream.peek().line, stream.peek().col);
    }

    return {
      kind: SyntaxNodeKind.Workspace,
      version,
      imports,
      exportDefs,
      fragmentExports,
      fragmentServiceExports,
      fragmentModelExports,
      product,
      location: { file, line: 1, col: 1 },
    };
  }

  private parseImport(stream: TokenStream, file: string): ImportNode {
    const symbols: string[] = [];
    if (stream.match(TokenType.LBRACE)) {
      while (!stream.check(TokenType.RBRACE) && !stream.atEnd()) {
        stream.match(TokenType.COMMA);
        if (stream.check(TokenType.RBRACE)) break;
        symbols.push(this.parseImportSymbol(stream));
        stream.match(TokenType.COMMA);
      }
      stream.expect(TokenType.RBRACE, "Expected '}' after import symbol list");
      stream.expect(TokenType.IDENT, "Expected 'from' after import list", "from");
    }

    const pathToken = stream.peek();
    if (pathToken.type !== TokenType.IDENT && pathToken.type !== TokenType.PATH) {
      throw new PactiaSyntaxError("Expected import path", pathToken.line, pathToken.col);
    }
    const path = stream.advance().value;
    stream.match(TokenType.SEMICOLON);
    return {
      kind: SyntaxNodeKind.Import,
      path,
      symbols: symbols.length > 0 ? symbols : undefined,
      location: { file, line: pathToken.line, col: pathToken.col },
    };
  }

  private parseImportSymbol(stream: TokenStream): string {
    if (stream.match(TokenType.HASH, "#")) {
      const name = stream.expect(TokenType.IDENT, "Expected macro name after '#' in import").value;
      return `#${name}`;
    }
    const token = stream.expect(TokenType.IDENT, "Expected import symbol");
    return token.value;
  }

  private parseProduct(stream: TokenStream, file: string): ProductNode {
    const nameToken = stream.expect(TokenType.IDENT, "Expected product name");
    stream.expect(TokenType.LBRACE, "Expected '{' after product name");
    const items: ProductItem[] = [];
    while (!stream.check(TokenType.RBRACE)) {
      stream.match(TokenType.COMMA);
      if (stream.check(TokenType.RBRACE)) break;
      items.push(this.parseProductItem(stream, file));
    }
    stream.expect(TokenType.RBRACE, "Expected '}' to close product block");
    return {
      kind: SyntaxNodeKind.Product,
      name: nameToken.value,
      items,
      location: { file, line: nameToken.line, col: nameToken.col },
    };
  }

  private parseProductItem(stream: TokenStream, file: string): ProductItem {
    if (stream.check(TokenType.IDENT, "module")) {
      if (stream.peek(1).type === TokenType.LPAREN) {
        return this.parseAttachModule(stream, file);
      }
      return this.parseModule(stream, file);
    }
    return this.parseTagLikeItem(stream, file) as ProductItem;
  }

  private parseAttachModule(stream: TokenStream, file: string): AttachModuleNode {
    const moduleToken = stream.expect(TokenType.IDENT, "Expected module keyword", "module");
    stream.expect(TokenType.LPAREN, "Expected '(' after module in attach reference");
    const nameToken = stream.expect(TokenType.IDENT, "Expected module attach symbol");
    stream.expect(TokenType.RPAREN, "Expected ')' after module attach symbol");
    stream.expect(TokenType.LBRACE, "Expected '{' after module attach reference");
    const services: AttachServiceNode[] = [];
    while (!stream.check(TokenType.RBRACE)) {
      stream.match(TokenType.COMMA);
      if (stream.check(TokenType.RBRACE)) break;
      services.push(this.parseAttachService(stream, file));
    }
    stream.expect(TokenType.RBRACE, "Expected '}' to close module attach block");
    return {
      kind: SyntaxNodeKind.AttachModule,
      name: nameToken.value,
      services,
      location: { file, line: moduleToken.line, col: moduleToken.col },
    };
  }

  private parseAttachService(stream: TokenStream, file: string): AttachServiceNode {
    const serviceToken = stream.expect(TokenType.IDENT, "Expected service keyword", "service");
    stream.expect(TokenType.LPAREN, "Expected '(' after service in attach reference");
    const nameToken = stream.expect(TokenType.IDENT, "Expected service attach symbol");
    stream.expect(TokenType.RPAREN, "Expected ')' after service attach symbol");
    stream.expect(TokenType.LBRACE, "Expected '{' after service attach reference");
    let modelSymbol: string | undefined;
    while (!stream.check(TokenType.RBRACE)) {
      stream.match(TokenType.COMMA);
      if (stream.check(TokenType.RBRACE)) break;
      if (stream.match(TokenType.IDENT, "model")) {
        stream.expect(TokenType.LPAREN, "Expected '(' after model in attach reference");
        modelSymbol = stream.expect(TokenType.IDENT, "Expected model attach symbol").value;
        stream.expect(TokenType.RPAREN, "Expected ')' after model attach symbol");
        continue;
      }
      throw new PactiaSyntaxError(
        "Attach service blocks may only contain model(...) references",
        stream.peek().line,
        stream.peek().col,
      );
    }
    stream.expect(TokenType.RBRACE, "Expected '}' to close service attach block");
    return {
      kind: SyntaxNodeKind.AttachService,
      name: nameToken.value,
      modelSymbol,
      location: { file, line: serviceToken.line, col: serviceToken.col },
    };
  }

  private parseModule(stream: TokenStream, file: string): ModuleNode {
    stream.expect(TokenType.IDENT, "Expected module keyword", "module");
    const nameToken = stream.expect(TokenType.IDENT, "Expected module name");
    stream.expect(TokenType.LBRACE, "Expected '{' after module name");
    const items: ModuleItem[] = [];
    while (!stream.check(TokenType.RBRACE)) {
      stream.match(TokenType.COMMA);
      if (stream.check(TokenType.RBRACE)) break;
      items.push(this.parseModuleItem(stream, file));
    }
    stream.expect(TokenType.RBRACE, "Expected '}' to close module block");
    return {
      kind: SyntaxNodeKind.Module,
      name: nameToken.value,
      items,
      location: { file, line: nameToken.line, col: nameToken.col },
    };
  }

  private parseModuleItem(stream: TokenStream, file: string): ModuleItem {
    if (stream.check(TokenType.IDENT, "service")) return this.parseService(stream, file);
    if (stream.check(TokenType.IDENT, "model")) return this.parseModel(stream, file);
    if (stream.check(TokenType.IDENT, "def")) return this.parseModuleConstOrDef(stream, file);
    return this.parseTagLikeItem(stream, file) as ModuleItem;
  }

  private parseModuleConstOrDef(stream: TokenStream, file: string): ModuleItem {
    if (this.checkDefSigilStart(stream, 0)) {
      return this.parseDefDecl(stream, file, false);
    }
    return this.parseModuleConst(stream, file);
  }

  private parseModuleConst(stream: TokenStream, file: string): ModuleConstNode {
    stream.expect(TokenType.IDENT, "Expected def keyword", "def");
    const nameToken = stream.expect(TokenType.IDENT, "Expected module constant name");
    stream.expect(TokenType.EQUALS, "Expected '=' in module constant declaration");
    const valueToken = this.parseModuleConstValue(stream);
    return {
      kind: SyntaxNodeKind.ModuleConst,
      name: nameToken.value,
      value: valueToken,
      location: { file, line: nameToken.line, col: nameToken.col },
    };
  }

  private parseModuleConstValue(stream: TokenStream): string {
    const token = stream.peek();
    if (token.type === TokenType.STRING || token.type === TokenType.NUMBER || token.type === TokenType.IDENT) {
      return stream.advance().value;
    }
    if (token.type === TokenType.GT) {
      return this.parseProse(stream, "").text;
    }
    throw new PactiaSyntaxError("Expected module constant value", token.line, token.col);
  }

  private parseService(stream: TokenStream, file: string): ServiceNode {
    stream.expect(TokenType.IDENT, "Expected service keyword", "service");
    const nameToken = stream.expect(TokenType.IDENT, "Expected service name");
    stream.expect(TokenType.LBRACE, "Expected '{' after service name");
    const items: ServiceItem[] = [];
    while (!stream.check(TokenType.RBRACE)) {
      stream.match(TokenType.COMMA);
      if (stream.check(TokenType.RBRACE)) break;
      if (stream.check(TokenType.IDENT, "def")) {
        items.push(this.parseModuleConst(stream, file));
        continue;
      }
      items.push(this.parseTagLikeItem(stream, file) as ServiceItem);
    }
    stream.expect(TokenType.RBRACE, "Expected '}' to close service block");
    return {
      kind: SyntaxNodeKind.Service,
      name: nameToken.value,
      items,
      location: { file, line: nameToken.line, col: nameToken.col },
    };
  }

  private parseModel(stream: TokenStream, file: string): ModelNode {
    const modelToken = stream.expect(TokenType.IDENT, "Expected model keyword", "model");
    let name: string | undefined;
    if (stream.check(TokenType.IDENT) && stream.peek(1).type === TokenType.LBRACE) {
      name = stream.advance().value;
    }
    stream.expect(TokenType.LBRACE, "Expected '{' after model");
    const items: ModelItem[] = [];
    while (!stream.check(TokenType.RBRACE)) {
      stream.match(TokenType.COMMA);
      if (stream.check(TokenType.RBRACE)) break;
      items.push(this.parseTagLikeItem(stream, file) as ModelItem);
    }
    stream.expect(TokenType.RBRACE, "Expected '}' to close model block");
    return {
      kind: SyntaxNodeKind.Model,
      name,
      items,
      location: { file, line: modelToken.line, col: modelToken.col },
    };
  }

  private parseTagLikeItem(stream: TokenStream, file: string): TagBlockNode | TagPrefixNode | MacroInvocationNode | ProseNode | FieldLineNode {
    stream.match(TokenType.COMMA);
    if (isMacroInvocationStart(stream)) {
      return this.parseMacroInvocation(stream, file);
    }
    if (stream.check(TokenType.IDENT) && isTagToken(stream.peek().value)) {
      return this.parseTagApplication(stream, file);
    }
    if (stream.check(TokenType.GT)) {
      return this.parseProse(stream, file);
    }
    throw new PactiaSyntaxError(`Unexpected token '${stream.peek().value}' in block`, stream.peek().line, stream.peek().col);
  }

  private parseTagApplication(stream: TokenStream, file: string): TagBlockNode | TagPrefixNode {
    const tagToken = stream.expect(TokenType.IDENT, "Expected @tag");
    const modifier = isModifierTagToken(tagToken.value);
    const tagName = tagNameFromToken(tagToken.value);
    let hostId: string | undefined;

    if (
      stream.check(TokenType.IDENT) &&
      !isTagToken(stream.peek().value) &&
      stream.peek(1).type === TokenType.LBRACE
    ) {
      hostId = stream.advance().value;
    }

    if (stream.check(TokenType.LBRACE)) {
      stream.advance();
      const items: TagBodyItem[] = [];
      while (!stream.check(TokenType.RBRACE)) {
        stream.match(TokenType.COMMA);
        if (stream.check(TokenType.RBRACE)) break;
        items.push(this.parseTagBodyItem(stream, file));
      }
      stream.expect(TokenType.RBRACE, "Expected '}' to close tag body");
      return {
        kind: SyntaxNodeKind.TagBlock,
        tagName,
        hostId,
        items,
        location: { file, line: tagToken.line, col: tagToken.col },
      };
    }

    let shorthand: string | undefined;
    if (
      (stream.check(TokenType.IDENT) ||
        stream.check(TokenType.STRING) ||
        stream.check(TokenType.NUMBER)) &&
      stream.peek(1).type !== TokenType.COLON &&
      stream.peek(1).type !== TokenType.LBRACE &&
      (stream.check(TokenType.NUMBER) || !isTagToken(stream.peek().value))
    ) {
      shorthand = stream.advance().value;
    }

    if (stream.check(TokenType.LPAREN)) {
      stream.advance();
      const argToken = stream.expect(TokenType.IDENT, "Expected modifier shorthand argument");
      stream.expect(TokenType.RPAREN, "Expected ')' after modifier shorthand");
      shorthand = argToken.value;
    }

    return {
      kind: SyntaxNodeKind.TagPrefix,
      tagName,
      shorthand,
      modifier,
      location: { file, line: tagToken.line, col: tagToken.col },
    };
  }

  private parseTagBodyItem(stream: TokenStream, file: string): TagBodyItem {
    stream.match(TokenType.COMMA);
    if (isMacroInvocationStart(stream)) {
      return this.parseMacroInvocation(stream, file);
    }
    if (stream.check(TokenType.IDENT) && isTagToken(stream.peek().value)) {
      return this.parseTagApplication(stream, file) as TagBlockNode;
    }
    if (stream.check(TokenType.GT)) {
      return this.parseProse(stream, file);
    }
    return this.parseFieldLine(stream, file);
  }

  private parseFieldLine(stream: TokenStream, file: string): FieldLineNode {
    const nameToken = stream.expect(TokenType.IDENT, "Expected field name");
    if (stream.match(TokenType.COMMA)) {
      return {
        kind: SyntaxNodeKind.FieldLine,
        name: nameToken.value,
        required: true,
        location: { file, line: nameToken.line, col: nameToken.col },
      };
    }
    stream.expect(TokenType.COLON, "Expected ':' or ',' after field name");
    const value = this.parseFieldValue(stream);
    stream.match(TokenType.COMMA);
    return {
      kind: SyntaxNodeKind.FieldLine,
      name: nameToken.value,
      value,
      required: false,
      location: { file, line: nameToken.line, col: nameToken.col },
    };
  }

  private parseFieldValue(stream: TokenStream): string {
    const parts: string[] = [];
    let depth = 0;

    while (!stream.atEnd()) {
      const token = stream.peek();
      if (depth === 0 && token.type === TokenType.COMMA) break;
      if (
        depth === 0 &&
        (token.type === TokenType.RBRACE ||
          (token.type === TokenType.IDENT &&
            (isTagToken(token.value) || this.isBlockKeyword(token.value))))
      ) {
        break;
      }
      if (token.type === TokenType.LBRACKET || token.type === TokenType.LBRACE) depth += 1;
      if (token.type === TokenType.RBRACKET || token.type === TokenType.RBRACE) depth -= 1;
      parts.push(stream.advance().value);
    }

    return parts.join(" ").trim();
  }

  private parseProse(stream: TokenStream, file: string): ProseNode {
    const start = stream.expect(TokenType.GT, "Expected prose prefix '>'");
    if (stream.match(TokenType.GT)) {
      const parts: string[] = [];
      while (!(stream.check(TokenType.GT) && stream.peek(1).type === TokenType.GT)) {
        if (stream.atEnd()) break;
        parts.push(stream.advance().value);
      }
      stream.expect(TokenType.GT, "Expected closing '>>'");
      stream.expect(TokenType.GT, "Expected closing '>>'");
      return {
        kind: SyntaxNodeKind.Prose,
        text: parts.join(" ").trim(),
        multiline: true,
        location: { file, line: start.line, col: start.col },
      };
    }

    const parts: string[] = [];
    while (
      !stream.atEnd() &&
      !stream.check(TokenType.RBRACE) &&
      !(stream.check(TokenType.IDENT) && (isTagToken(stream.peek().value) || this.isBlockKeyword(stream.peek().value))) &&
      !(stream.check(TokenType.HASH, "#") && (stream.peek(1).type === TokenType.LBRACKET || stream.peek(1).type === TokenType.IDENT))
    ) {
      const token = stream.peek();
      if (token.type === TokenType.IDENT && token.value === "module") break;
      if (token.type === TokenType.IDENT && token.value === "service") break;
      if (token.type === TokenType.IDENT && token.value === "model") break;
      if (token.type === TokenType.IDENT && token.value === "def") break;
      parts.push(stream.advance().value);
    }

    return {
      kind: SyntaxNodeKind.Prose,
      text: parts.join(" ").trim(),
      multiline: false,
      location: { file, line: start.line, col: start.col },
    };
  }

  private parseMacroInvocation(stream: TokenStream, file: string): MacroInvocationNode {
    stream.expect(TokenType.HASH, "Expected '#'");
    const bracketed = stream.match(TokenType.LBRACKET);
    const nameToken = stream.expect(TokenType.IDENT, "Expected macro name");
    const args: string[] = [];
    if (stream.match(TokenType.LPAREN)) {
      while (!stream.check(TokenType.RPAREN) && !stream.atEnd()) {
        args.push(this.parseMacroArg(stream));
        stream.match(TokenType.COMMA);
      }
      stream.expect(TokenType.RPAREN, "Expected ')' after macro args");
    }
    if (bracketed) {
      stream.expect(TokenType.RBRACKET, "Expected ']' to close macro invocation");
    }
    return {
      kind: SyntaxNodeKind.MacroInvocation,
      name: nameToken.value,
      args,
      legacyBracketed: bracketed,
      location: { file, line: nameToken.line, col: nameToken.col },
    };
  }

  private parseMacroArg(stream: TokenStream): string {
    const token = stream.peek();
    if (
      token.type === TokenType.IDENT ||
      token.type === TokenType.STRING ||
      token.type === TokenType.NUMBER
    ) {
      return stream.advance().value;
    }
    throw new PactiaSyntaxError("Expected macro argument", token.line, token.col);
  }

  private parseDefDecl(
    stream: TokenStream,
    file: string,
    atRoot: boolean,
    exportAlreadySeen = false,
  ): DefDeclNode {
    const exported = exportAlreadySeen || stream.match(TokenType.IDENT, "export");
    stream.expect(TokenType.IDENT, "Expected def keyword", "def");

    let sigil: DefSigil;
    let name: string;
    if (stream.match(TokenType.HASH, "#")) {
      sigil = DefSigil.Macro;
      name = stream.expect(TokenType.IDENT, "Expected macro def name").value;
    } else {
      const tagToken = stream.expect(TokenType.IDENT, "Expected @tag def name");
      if (!isTagToken(tagToken.value)) {
        throw new PactiaSyntaxError("Tag defs must use @name sigil", tagToken.line, tagToken.col);
      }
      sigil = DefSigil.Tag;
      name = tagNameFromToken(tagToken.value);
    }

    const params = this.parseOptionalParams(stream);
    const inTargets = this.parseOptionalInClause(stream);
    if (exported && inTargets.length === 0) {
      throw new PactiaSyntaxError("export def must declare in placement targets", stream.peek().line, stream.peek().col);
    }

    stream.expect(TokenType.LBRACE, "Expected '{' to open def body");
    const bodyItems: TagBodyItem[] = [];
    while (!stream.check(TokenType.RBRACE)) {
      bodyItems.push(this.parseTagBodyItem(stream, file));
    }
    stream.expect(TokenType.RBRACE, "Expected '}' to close def body");

    const bodySource = bodyItems
      .map((item) => {
        if (item.kind === SyntaxNodeKind.Prose) return `> ${item.text}`;
        if (item.kind === SyntaxNodeKind.FieldLine) {
          return item.required ? `${item.name},` : `${item.name}: ${item.value ?? ""},`;
        }
        if (item.kind === SyntaxNodeKind.TagBlock) return `@${item.tagName} { ... }`;
        if (item.kind === SyntaxNodeKind.MacroInvocation) {
          const argSuffix = item.args.length > 0 ? `(${item.args.join(", ")})` : "";
          return `#${item.name}${argSuffix}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");

    return {
      kind: exported ? SyntaxNodeKind.DefExport : SyntaxNodeKind.DefLocal,
      exported,
      sigil,
      name,
      params,
      inTargets: inTargets.length > 0 ? inTargets : [...allPlacementTargets],
      modifier: fieldSpecFromDefBody(bodyItems).modifier,
      bodyItems,
      bodySource,
      location: { file, line: stream.location(file).line, col: stream.location(file).col },
    };
  }

  private parseOptionalParams(stream: TokenStream): string[] {
    if (!stream.match(TokenType.LPAREN)) return [];
    const params: string[] = [];
    while (!stream.check(TokenType.RPAREN) && !stream.atEnd()) {
      params.push(stream.expect(TokenType.IDENT, "Expected parameter name").value);
      stream.match(TokenType.COMMA);
    }
    stream.expect(TokenType.RPAREN, "Expected ')' after parameter list");
    return params;
  }

  private parseOptionalInClause(stream: TokenStream): PlacementTarget[] {
    if (!stream.match(TokenType.IDENT, "in")) return [];
    const targets: PlacementTarget[] = [];
    do {
      const targetToken = stream.expect(TokenType.IDENT, "Expected in placement target");
      const parsed = parsePlacementTarget(targetToken.value);
      if (!parsed) {
        throw new PactiaSyntaxError(`Unknown placement target '${targetToken.value}'`, targetToken.line, targetToken.col);
      }
      targets.push(parsed);
      if (!stream.match(TokenType.COMMA)) break;
    } while (!stream.check(TokenType.LBRACE));
    return targets;
  }

  private checkDefStart(stream: TokenStream): boolean {
    if (stream.check(TokenType.IDENT, "export") && stream.peek(1).type === TokenType.IDENT && stream.peek(1).value === "def") {
      return true;
    }
    return stream.check(TokenType.IDENT, "def") && this.checkDefSigilStart(stream, 0);
  }

  private checkDefSigilStart(stream: TokenStream, defOffset: number): boolean {
    const next = stream.peek(defOffset + 1);
    if (next.type === TokenType.HASH) return true;
    return next.type === TokenType.IDENT && isTagToken(next.value);
  }

  private isBlockKeyword(value: string): boolean {
    return value === "module" || value === "service" || value === "model" || value === "def";
  }
}

export const recursiveDescentParser = new RecursiveDescentParser();

export function parseSyntaxTree(input: ParseInput): SyntaxTree {
  return recursiveDescentParser.parse(input);
}
