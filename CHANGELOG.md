# Changelog

All notable compiler changes are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.2.0] - 2026-06-24

### Added

- **`context` keyword** — parse, bind, and lower `context { }`, `export context`, `context(symbol)` attach, and `def alias = context name { }` to `context[]` on IR slices
- **Package `export context`** — resolve partial imports from vendored `index.pactia`; package-relative paths in lowered IR

### Changed

- Vendored `.pactia/packages/` are produced by **`pactia install`** / **`pactia build`** in the product workspace — not by pactiac alone
- Gitignore vendored `.pactia/` directories under test fixtures

## [0.1.0] - 2026-06-18

Initial `@pactia/pactiac` release track.

### Added

- Single-file compile (`pactiac compile -i`) from kernel tag extract to module-scoped IR JSON
- Multi-file workspace compile (`pactiac compile -w`) with discover, merge, and assemble
- Local package resolver: `pactia.toml`, `pactia.lock`, vendored `.pactia/packages/`, `lockfileDigest` in manifest
- Compile pipeline: parse, bind, expand macros, validate def fields, generic lower to JSON IR
- Pipeline-shaped `src/` layout: `frontend/`, `passes/`, `adapters/`, `application/`
- Golden tests: relay kernel and workspace fixtures
- Native binaries for Linux, macOS, and Windows (Bun compile)

[Unreleased]: https://github.com/pactia-lang/pactiac/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/pactia-lang/pactiac/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/pactia-lang/pactiac/releases/tag/v0.1.0
