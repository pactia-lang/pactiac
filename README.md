# pactiac

Pactia compiler — parse `.pactia` source, lower to module-scoped IR, emit workspace YAML.

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
npm run hooks:install   # optional — pre-commit runs tests, pre-push checks IR schema drift
npm run build
npm test
```

Golden tests bundle [fleet-management-v2.pactia](test/fixtures/kernel/fleet-management-v2.pactia) (synced from [pactia-lang/spec](https://github.com/pactia-lang/spec)). Override the input fixture root with:

```bash
export PACTIA_SPEC_ROOT=/path/to/spec
npm test
```

## Workspace layout

```
pactiac/
  packages/
    schema/                 @pactia/schema — IR Zod models + JSON Schema export
      generated/ir/         committed JSON Schema mirror (CI drift-checked)
      test/fixtures/        hand-authored IR samples for schema unit tests
    pactiac/                @pactia/pactiac — compile pipeline (frontend, lower, emit, resolve), CLI
      src/
        compile/              compile(), compileWorkspace(), version gate
        frontend/
          lexer/              token types and tokenizer
          kernel/             tag/block extract → KernelProgram
          scenarios/          @test extract, when/then clauses, scenario lower
          workspace/          multi-file discover, merge, assemble
        lower/                KernelProgram → IR workspace
        emit/                 IR → deterministic YAML
        resolve/              pactia.toml / lock / vendored packages
        diagnostics/
  test/
    fixtures/
      kernel/               bundled .pactia input
      workspace/fleet/      multi-file workspace fixture
      packages/             shared vendored package stubs for tests
      expected/fleet/       golden IR workspace output
    fixture-paths.ts
  .githooks/                  pre-commit (test), pre-push (IR schema drift)
  scripts/
    generate-golden.ts
    install-hooks.sh
```

## IR JSON Schema sync

Zod models in `@pactia/schema` are the source of truth. Export committed copies:

```bash
npm run export:ir-schemas
```

By default this writes to `packages/schema/generated/ir/`. In a monorepo checkout next to `spec/`:

```bash
PACTIA_SPEC_ROOT=../spec npm run export:ir-schemas -w @pactia/schema
```

CI fails if `generated/ir` drifts. The optional `sync-ir-schemas` workflow (requires `SPEC_SYNC_TOKEN`) can open commits on `pactia-lang/spec`.

## Specification coupling

| pactiac release | Implements spec |
| --- | --- |
| 0.1.x | Pactia 1.0 — kernel tag extract + module-scoped IR; workspace compile (`-w`) + local package resolver stub; macro expansion partial |

### Compile output layout

```
manifest.yaml
product.yaml
modules/<module>/<module>.module.yaml
modules/<module>/<module>.model.yaml
modules/<module>/services/<service>.service.yaml
```

## License

MIT — see [LICENSE](LICENSE).
