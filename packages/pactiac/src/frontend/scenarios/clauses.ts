import { ScenarioOwnership } from "../../domain/provenance.js";
import type { ScenarioGiven, ScenarioThenInput, ScenarioWhen } from "./types.js";

const HTTP_METHOD_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/;
const ACTOR_PATTERN = /^([A-Z][A-Za-z0-9]*)\b/;
const OWNERSHIP_PATTERN = /\bas\s+(owner|non-owner)\b/i;
const STATUS_PATTERN = /\bstatus\s+is\s+(\d{3})\b/i;
const BODY_REF_PATTERN = /\bmatches\s+([A-Z][A-Za-z0-9]*)\b/;
const EMIT_PATTERN = /\b([a-z][\w]*\.[a-z][\w]*)\s+is\s+emitted\b/i;

export function parseWhenClause(text: string): { given: ScenarioGiven; when: ScenarioWhen } {
  const methodMatch = HTTP_METHOD_PATTERN.exec(text);
  if (!methodMatch) {
    throw new Error(`When clause missing HTTP method and path: ${text}`);
  }

  const actorMatch = ACTOR_PATTERN.exec(text.trim());
  const ownershipMatch = OWNERSHIP_PATTERN.exec(text);

  const given: ScenarioGiven = {};
  if (actorMatch) {
    given.actor = actorMatch[1];
  }
  if (/\blogged\s+in\b/i.test(text)) {
    given.auth = "logged_in";
  }
  if (ownershipMatch) {
    const value = ownershipMatch[1]!.toLowerCase();
    given.ownership =
      value === ScenarioOwnership.NonOwner
        ? ScenarioOwnership.NonOwner
        : ScenarioOwnership.Owner;
  }

  const when: ScenarioWhen = {
    method: methodMatch[1]!,
    path: methodMatch[2]!,
  };

  if (/\bwith\s+valid\s+body\b/i.test(text)) {
    when.body = { valid: true };
  }

  return { given, when };
}

export function parseThenClause(text: string): ScenarioThenInput {
  const then: ScenarioThenInput = {};

  const statusMatch = STATUS_PATTERN.exec(text);
  if (statusMatch) {
    then.httpStatus = statusMatch[1];
  }

  const bodyMatch = BODY_REF_PATTERN.exec(text);
  if (bodyMatch) {
    then.bodyRef = bodyMatch[1];
  }

  const emitMatch = EMIT_PATTERN.exec(text);
  if (emitMatch) {
    then.kafkaEmits = emitMatch[1];
  }

  return then;
}
