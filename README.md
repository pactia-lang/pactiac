# pactiac

Pactia compiler — parse `.pactia` source, lower to module-scoped IR, emit workspace JSON.

Implements the normative specification in [pactia-lang/spec](https://github.com/pactia-lang/spec).

## Commands

```bash
# Compile a single product file to an IR workspace directory
pactiac compile -i product.pactia -o input/ [--report] [--provenance report.json]

# Compile a multi-file workspace (product.pactia + modules/**)
pactiac compile -w ./my-product -o input/ [--report] [--provenance report.json]

# Regenerate golden test fixtures after intentional compiler changes
npm run generate:golden
```

### Workspace layout (source)

```
my-product/
  product.pactia
  pactia.toml
  pactia.lock
  .pactia/packages/          # vendored packages for offline/CI resolve
  modules/<module>/
    module.pactia
    services/<name>.service.pactia
    features/*.pactia
    entities/*.pactia
```

Vendored package directories use the form `@scope--name@<version>/` (slashes in coordinates become `--`). Override the vendor search path with `PACTIA_VENDOR_ROOT` when packages live outside the workspace.

## Development

```bash
npm install
npm run hooks:install   # optional — pre-commit runs tests, pre-push runs tests
npm run build
npm test
```

Golden tests use [relay.pactia](test/fixtures/kernel/relay.pactia) and related fixtures under `test/fixtures/`.

## Workspace layout

```
pactiac/
  src/
    application/            compile pipeline orchestrator
    passes/                 parse, bind, expand-macros, lower
    adapters/               fs registry loader, TOML lock, JSON emit
    frontend/workspace/     multi-file discover, merge, assemble
    domain/                 SyntaxTree, BoundTree, IR types, compile phases
  test/
    fixtures/
      kernel/               bundled .pactia input
      workspace/relay/      multi-file workspace fixture
      packages/             vendored package stubs for tests
      expected/relay/       golden IR workspace output
    fixture-paths.ts
  .githooks/                pre-commit (test), pre-push (test)
  scripts/
    generate-golden.ts
    install-hooks.sh
```

IR shape is defined in [spec/docs/compilation.md](https://github.com/pactia-lang/spec/blob/main/docs/compilation.md) — there is no JSON Schema for compiler output in the spec repo.

## Specification coupling

| pactiac release | Implements spec |
| --- | --- |
| 0.1.x | Pactia 1.0 — parse/bind/lower to module-scoped JSON IR; workspace compile; macro expansion from package `export def` |

### Compile output layout

```
input/manifest.json
input/product.json
input/modules/<module>/<module>.module.json
input/modules/<module>/<module>.model.json
input/modules/<module>/services/<service>.service.json
input/workspace.json
```

## License

MIT — see [LICENSE](LICENSE).
