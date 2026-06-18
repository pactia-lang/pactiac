# Changelog

All notable compiler changes are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **Builtin macro expansion:** `lower/macros.ts` lowers `#[list]`, `#[paginated]`, `#[detail]`, `#[create]`, and `#[idempotent]` into endpoint `modifiers.*` IR keys; ownership macros map to `authorization.ownership.scope`.
- **Manifest references:** `lower/references.ts` populates `manifest.references[]` from cross-module `@fk` edges in model slices.
- **Structural tag validation:** `frontend/validate/tags.ts` checks required `@api`, `@entity`, and `@stack` fields during compile (diagnostics until JSON Schema tag bodies are normative).

### Changed

- Fleet golden `fleet.service.yaml` uses expanded `modifiers.*` instead of a raw `macros` name list.
- `compileIrWorkspace` reports `macro.expansion` only for unknown macros, not recognized builtins.

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
