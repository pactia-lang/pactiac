import {
  ScenarioProvenance,
  type ScenarioEntry,
  type ScenariosInput,
  scenariosInputSchema,
} from "@pactia/schema";
import type { ScenarioDecl } from "./types.js";
import { parseThenClause, parseWhenClause } from "./clauses.js";

export function lowerScenarios(decls: readonly ScenarioDecl[]): ScenariosInput {
  const scenarios: ScenarioEntry[] = decls.map((decl) => {
    if (!decl.whenText || !decl.thenText || !decl.service) {
      throw new Error(`Scenario '${decl.name}' is missing v2 When/Then clauses or service scope`);
    }

    const { given, when } = parseWhenClause(decl.whenText);
    const then = parseThenClause(decl.thenText);

    return {
      name: decl.name,
      service: decl.service,
      provenance: ScenarioProvenance.Pactia,
      given,
      when,
      then,
    };
  });

  return scenariosInputSchema.parse({ scenarios });
}
