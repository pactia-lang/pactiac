# pactiac

[![CI](https://github.com/pactia-lang/pactiac/actions/workflows/ci.yml/badge.svg)](https://github.com/pactia-lang/pactiac/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/pactia-lang/pactiac/branch/main/graph/badge.svg)](https://codecov.io/gh/pactia-lang/pactiac)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)](https://github.com/pactia-lang/pactiac/releases)

Pactia compiler — parse `.pactia` source, lower to module-scoped IR, emit workspace JSON.

Implements the normative specification in [pactia-lang/spec](https://github.com/pactia-lang/spec).

## Commands

```bash
# Compile a single product file to an IR workspace directory
pactiac compile -i product.pactia -o input/ [--report] [--provenance report.json]

# Compile a multi-file workspace (import + attach in product.pactia)
pactiac compile -w ./my-product -o input/ [--report] [--provenance report.json]

# Regenerate golden test fixtures after intentional compiler changes
npm run generate:golden
```

### Workspace assembly (source)

**Import + attach (normative)** — folder-agnostic. Fragment paths come from `import … from ./any/path` in `product.pactia`; the attach tree wires symbols:

```
my-product/
  product.pactia              # package imports + fragment imports + attach tree
  pactia.toml
  pactia.lock
  fragments/…                 # convention — paths are arbitrary
  modules/…                   # convention — PPM uses this layout
  .pactia/packages/           # vendored packages (from pactia install / build)
```

**Package imports vs fragment imports:** declare `import { @api, #database, … } from @pactia/…` only in `product.pactia`. Fragment files use `export module` / `export service` / `export model` and are wired with `import { Symbol } from ./path` plus `module(name) { service(Symbol) { … } }`. Package imports in a fragment file trigger a **`FRAGMENT_PACKAGE_IMPORT`** warning (ignored at assembly). See [spec — Workspace layout](https://github.com/pactia-lang/spec/blob/main/docs/language-spec.md#workspace-layout).

Examples: [relay](test/fixtures/workspace/relay) (`./fragments/…`), [PPM](https://github.com/pactia-lang/examples/tree/main/ppm) (`./modules/…`).

Vendored package directories use the form `@scope--name@<version>/` (slashes in coordinates become `--`). Override the vendor search path with `PACTIA_VENDOR_ROOT` when packages live outside the workspace.

## Development

```bash
npm install
npm run hooks:install   # optional — pre-commit runs tests, pre-push runs tests
npm test
npm run build
```

### Compile output layout

```
input/manifest.json
input/product.json
input/modules/<module>/<module>.module.json
input/modules/<module>/<module>.model.json
input/modules/<module>/services/<service>.service.json
input/workspace.json
```

After `pactia build`: `input/context.index.json` and `input/context/` (bundled context files) — see [spec — Context index](https://github.com/pactia-lang/spec/blob/main/docs/compilation.md#context-index-pactia-build).

| pactiac release | Implements spec |
| --- | --- |
| 0.3.x | Pactia 1.2 / 1.3 — package constants (`export def name = value`); `CONSTANT_DEF_REQUIRED`; topology packages (`export "./file"` manifest, `structuralExports`, profile detection, `exports`/`mixed-exports` fields); 12 topology diagnostics (`TOPOLOGY_DEF_FORBIDDEN`, `TOPOLOGY_WILDCARD_FORBIDDEN`, `TOPOLOGY_NESTED_EXPORT`, `TOPOLOGY_MULTIPLE_ROOT_EXPORTS`, `TOPOLOGY_MANIFEST_INLINE_EXPORT`, `TOPOLOGY_EXPORT_FILE_MISSING`, `PACKAGE_EXPORT_MIXED`, `PACKAGE_PROFILE_MISMATCH`, `HYBRID_PACKAGE_DISCOURAGED`, `PACKAGE_IMPORT_MIXED`, `EXPORT_NOT_DECLARED`, `TOPOLOGY_DUPLICATE_SERVICE`); `*` wildcard import |
| 0.2.x | Pactia 1.2 — source-order `body[]` IR; structural `context[]` with `name`; `FRAGMENT_PACKAGE_IMPORT` warning; package `export context` |
| 0.1.x | Pactia 1.0 — parse/bind/lower to module-scoped JSON IR; workspace compile (import + attach; legacy folder scan); macro expansion from package `export def` |

## License

MIT — see [LICENSE](LICENSE).
