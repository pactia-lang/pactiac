# Changelog

All notable compiler changes are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **Package constants** — `export def name = value` in package `index.pactia`; parsed at file root and stored in `EffectiveRegistry.constants`. Consumers import with `import { name } from @pkg` and interpolate via `${name}` in prose/macro bodies.
- **`CONSTANT_DEF_REQUIRED`** diagnostic — emitted in bind pass for bare `export name = value` (missing `def` keyword).
- **`EXPORT_KIND_AMBIGUITY`** diagnostic code reserved for 1.3 mixed-package detection.
- **Topology packages (1.3)** — `export "./file.pactia"` manifest parsing; `PackageProfile` detection (Registry/Topology/Mixed); `extractExportBody()` for topology body extraction; `EffectiveRegistry.structuralExports` map; manifest file loading in `FsRegistryLoader`; topology body inlining during workspace assembly.
- **Topology diagnostics** — `TOPOLOGY_DEF_FORBIDDEN`, `TOPOLOGY_WILDCARD_FORBIDDEN`, `PACKAGE_EXPORT_MIXED` (requires `mixed-exports = true` in `pactia.toml`), `EXPORT_NOT_DECLARED`.
- **`mixed-exports` in `PactiaPackageToml`** — parsed from `[package]` section for mixed package opt-in.
- **Validate pass** — validates tag body fields against registry `def` field specs after macro expansion. Checks missing required fields, unknown fields (openExtension-aware), and duplicate keys. All diagnostics are warnings (non-blocking).
- **90% statement coverage** — 166 tests; new test files: `ir-path`, `ir-slot-writer`, `token-stream`, `registry`, `loader`, `manifest`, `extract-body`.

### Changed

- **`context` keyword** — lowers to structural **`context[]`** on each IR slice with `name` (not `id`); registry `@context` (if any) uses `body[]` with `tag: context`
- **`FRAGMENT_PACKAGE_IMPORT`** — warning when a fragment file contains a package import (ignored at assembly)
- Breaking: IR no longer uses per-type aggregation arrays (`entities[]`, `endpoints[]`, …); host tags use source-order **`body[]`**, context keyword uses structural **`context[]`**

### Removed

- **`#[name]` bracket macro syntax** — parser no longer accepts legacy bracket form; `#name` / `#name(args)` is the only macro invocation syntax
- **Legacy folder scan** — `modules/<dir>/module.pactia` directory convention removed from discover; only import + attach supported
- **v0.1 scenario extraction code** — `frontend/scenarios/` directory deleted
- **v0.1 diagnostics shim** — `diagnostics/diagnostic.ts` deleted
- **Legacy diagnostic codes** — `LegacyMacroSyntax`, `StateBindingInvalid`, `StateDuplicateTransition`, `StateTransitionUndefined`, `StackBindingMismatch` removed
- **`legacyBracketed` field** — removed from `MacroInvocationNode`

## [0.2.0] - 2026-06-24

### Added

- **`context` keyword** — lowers to `context[]` on IR slices (structural); not mixed into `body[]`
- **Package `export context`** — resolve partial imports from vendored `index.pactia`; package-relative paths in lowered IR

### Changed

- Vendored `.pactia/packages/` are produced by **`pactia install`** / **`pactia build`** in the product workspace — not by pactiac alone
- Gitignore vendored `.pactia/` directories under test fixtures

## [0.1.0] - 2026-06-18

Initial `@pactia/pactiac` release track.

[Unreleased]: https://github.com/pactia-lang/pactiac/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/pactia-lang/pactiac/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/pactia-lang/pactiac/releases/tag/v0.1.0
