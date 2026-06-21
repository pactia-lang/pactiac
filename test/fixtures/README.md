# Test fixtures

`.pactia` programs and golden IR used by pactiac tests. Cited from [pactia-lang/spec](https://github.com/pactia-lang/spec) docs.

| Path                                  | Role                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| `kernel/relay.pactia`                 | **1.2 canonical** monolith — `#rust-stack`, attach-free         |
| `kernel/pactia-lang-website.pactia`   | Multi-`@surface` marketing site example                         |
| `packages/fintech-rules-index.pactia` | Package `export def` sample                                     |
| `workspace/relay/`                    | Import + attach multi-file workspace                            |
| `expected/relay/`                     | Golden JSON IR for relay                                        |
| `packages/@pactia--*`                 | Vendored package stubs for resolve tests                        |
| `spec/`                               | Bundled tag JSON Schema catalog for CI (legacy validation path) |

Full runnable products: [examples](https://github.com/pactia-lang/examples).
