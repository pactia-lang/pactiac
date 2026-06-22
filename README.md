# pactiac

Pactia compiler — parse `.pactia` source, lower to module-scoped IR, emit workspace JSON.

Implements the normative specification in [pactia-lang/spec](https://github.com/pactia-lang/spec).

## Commands

```bash
# Compile a single product file to an IR workspace directory
pactiac compile -i product.pactia -o input/ [--report] [--provenance report.json]

# Compile a multi-file workspace (product.pactia + fragments via attach)
pactiac compile -w ./my-product -o input/ [--report] [--provenance report.json]

# Regenerate golden test fixtures after intentional compiler changes
npm run generate:golden
```

### Workspace layout (source)

**Import + attach (1.2)** — preferred for multi-file products:

```
my-product/
  product.pactia              # package imports, attach tree, product-level tags
  pactia.toml
  pactia.lock
  fragments/
    orders.module.pactia      # export module orders { … }
    orders.model.pactia       # export model orders_model { … }
    order.service.pactia      # export service OrderService { … }
  .pactia/packages/           # vendored packages (from pactia fetch / build)
```

**Package imports vs fragment imports:** declare `import { @api, #database, … } from @pactia/…` only in `product.pactia`. Fragment files use `export module` / `export service` / `export model` and are wired with `import { Symbol } from ./fragments/…` plus `module(name) { service(Symbol) { … } }`. The compiler merges attach bodies into one program; tags in fragments resolve from the product-level package imports. See [spec — Package imports vs fragment imports](https://github.com/pactia-lang/spec/blob/main/docs/language-spec.md#package-imports-vs-fragment-imports).

**Legacy folder merge (deprecated):** `modules/<module>/module.pactia` + `services/*.service.pactia` scanned by directory layout. New workspaces should use export + attach. Example: [workspace/relay](test/fixtures/workspace/relay).

Vendored package directories use the form `@scope--name@<version>/` (slashes in coordinates become `--`). Override the vendor search path with `PACTIA_VENDOR_ROOT` when packages live outside the workspace.

## Development

```bash
npm install
npm run hooks:install   # optional — pre-commit runs tests, pre-push runs tests
npm run build
npm test
```

Golden tests use [relay.pactia](test/fixtures/kernel/relay.pactia), [workspace/relay](test/fixtures/workspace/relay), [workspace/website](test/fixtures/workspace/website), and related fixtures under `test/fixtures/`.

## Native binary (no Node required)

Build standalone executables with [Bun](https://bun.sh) compile:

```bash
# Install Bun, then:
bun run build:bin:linux-x64          # one platform
bun run build:bin                    # all platforms (release)
bun run test:bin                     # build + smoke relay workspace
./dist/pactiac-linux-x64 compile -w ./my-product -o out/
```

Release assets are published on [GitHub Releases](https://github.com/pactia-lang/pactiac/releases) when you push a version tag (`v*`).

### Linux and macOS

```bash
curl -fsSL https://raw.githubusercontent.com/pactia-lang/pactiac/main/scripts/install-pactiac.sh | bash
./scripts/install-pactiac.sh v0.1.0
```

Picks `pactiac-darwin-arm64` on Apple Silicon or `pactiac-darwin-x64` on Intel Mac. Installs to `~/.local/bin/pactiac`.

### Windows

```powershell
irm https://raw.githubusercontent.com/pactia-lang/pactiac/main/scripts/install-pactiac.ps1 | iex
```

Or download `pactiac-windows-x64.exe` from [Releases](https://github.com/pactia-lang/pactiac/releases).

The **npm package** (`npm run build` → `dist/`) remains the library API for [pactia](https://github.com/pactia-lang/pactia) and programmatic use. The native binary is the standalone CLI.

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
    install-pactiac.sh
    install-pactiac.ps1
    smoke-binary.sh
```

IR shape is defined in [spec/docs/compilation.md](https://github.com/pactia-lang/spec/blob/main/docs/compilation.md) — there is no JSON Schema for compiler output in the spec repo.

## Specification coupling

| pactiac release | Implements spec |
| --- | --- |
| 0.1.x | Pactia 1.0 — parse/bind/lower to module-scoped JSON IR; workspace compile (import + attach and legacy folder merge); macro expansion from package `export def` |

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
