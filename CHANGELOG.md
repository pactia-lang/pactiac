# Changelog

All notable compiler changes are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **Builtin macro expansion:** `lower/macros.ts` lowers `#[list]`, `#[paginated]`, `#[detail]`, `#[create]`, and `#[idempotent]` into endpoint `modifiers.*` IR keys; ownership macros map to `authorization.ownership.scope`.
- **Manifest references:** `lower/references.ts` populates `manifest.references[]` from cross-module `@fk` edges in model slices.
- **Structural tag validation:** `frontend/validate/tags.ts` checks required `@api`, `@entity`, and `@stack` fields during compile (diagnostics until JSON Schema tag bodies are normative).
- **Effective registry:** `resolve/registry.ts` builds workspace macro precedence (stack package > explicit imports > builtins) from vendored `pactia.package.yaml` manifests.
- **Package macro overrides:** `lower/macros.ts` flattens package `expands_to` chains (nested `#[macro]` and `modifiers.*` IR assignments) before builtin lowering; detects `MACRO_EXPANSION_CYCLE`.
- **Registry errors:** `REGISTRY_COLLISION` when two imports export the same macro name.
- **JSON Schema tag validation:** `frontend/validate/` loads `kernel-tags.yaml` from `PACTIA_SPEC_ROOT`, sibling `../spec`, or bundled `test/fixtures/spec/` (CI), validates normative tag bodies with Ajv (`TAG_BODY_INVALID`).
- **REST wire validation:** `frontend/validate/protocol-wire.ts` validates `@api` `method`/`path` against `@pactia/protocol-rest` package wire schema (`WIRE_INVALID`).
- **Fleet module/service tag validation:** JSON Schema bodies for `@input`, `@output`, `@emit`, `@throws`, `@actor`, `@deploy`, `@rule`, `@config`, `@errors`, `@event`, `@integration`, `@observe`, `@policy`, and `@status` in bundled CI catalog.
- **Fleet model/field tag validation:** JSON Schema bodies for `@enum`, `@relation`, `@states`, and field modifiers (`@pk`, `@fk`, `@unique`, `@index`, `@nullable`, `@pii`).
- **Fleet product/service tag validation:** JSON Schema bodies for `@topology`, `@tenancy`, `@guide`, `@security`, `@surface`, and `@test`; `@must` schema bundled for future obligation extraction.

### Changed

- Fleet golden `fleet.service.yaml` uses expanded `modifiers.*` instead of a raw `macros` name list.
- `compileIrWorkspace` reports `macro.expansion` only for unknown macros, not recognized builtins.
- `compileWorkspace` passes `effectiveRegistry` from resolved packages into IR lowering.
- When `PACTIA_SPEC_ROOT` resolves, `validateKernelTags` uses JSON Schema instead of structural-only checks.

## [0.1.0] - 2026-06-18

Initial `@pactia/pactiac` release track.

### Added

- Single-file compile (`pactiac compile -i`) from kernel tag extract to module-scoped IR YAML.
- Multi-file workspace compile (`pactiac compile -w`) with discover, merge, and assemble.
- Local package resolver stub: `pactia.toml`, `pactia.lock`, vendored `.pactia/packages/`, real `lockfileDigest`.
- `@pactia/schema` Zod models and committed JSON Schema export under `packages/schema/generated/ir/`.
- Pipeline-shaped `src/` layout: `frontend/`, `lower/`, `emit/`, `resolve/`, `diagnostics/`.
- Golden tests: fleet monolith and workspace fixtures (`test/fixtures/expected/fleet/`).

[Unreleased]: https://github.com/pactia-lang/pactiac/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/pactia-lang/pactiac/releases/tag/v0.1.0
