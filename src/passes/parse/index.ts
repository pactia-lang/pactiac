/** Phase 3 — recursive descent parse → SyntaxTree (L0). */
export const passName = "parse" as const;
export { parseSyntaxTree, recursiveDescentParser, fieldSpecFromDefBody } from "./recursive-descent-parser.js";
export { TokenStream, isTagToken, tagNameFromToken } from "./token-stream.js";
