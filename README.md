# pactiac

Pactia compiler — parse `.pactia` source, lower to machine IR, emit workspace YAML.

Implements the normative specification in [pactia-lang/spec](https://github.com/pactia-lang/spec).

## Commands

```bash
pactiac compile -i product.pactia -o input/ [--report] [--provenance report.json]
```

## Development

```bash
npm install
npm run build
npm test
```

Golden tests bundle [fleet-management-v2.pactia](test/fixtures/kernel/fleet-management-v2.pactia) (synced from [pactia-lang/spec](https://github.com/pactia-lang/spec)). To test against a local spec checkout instead:

```bash
export PACTIA_SPEC_ROOT=/path/to/spec
npm test
```

## Workspace layout

```
pactiac/
  packages/
    schema/       @pactia/schema — IR Zod models + JSON Schema export
    pactiac/      @pactia/pactiac — lexer, parser, partial compiler
  test/
    fixtures/     Bundled .pactia inputs + module-scoped IR YAML samples
    fixture-paths.ts
```

## Specification coupling

| pactiac release | Implements spec |
| --- | --- |
| 1.0.x | Pactia 1.0 (kernel partial — `@test` lowering today) |

## License

MIT — see [LICENSE](LICENSE).
