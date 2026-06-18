## Summary

<!-- What changed and why? Link related issues: Fixes #123 -->

## Type of change

- [ ] Bug fix (parser, lowering, emit, or CLI)
- [ ] Feature (new kernel lowering, schema field, CLI flag, …)
- [ ] Refactor (no behavior change)
- [ ] Tests / fixtures only
- [ ] Tooling (CI, hooks, docs)
- [ ] Breaking change

## Spec coupling

- [ ] No [pactia-lang/spec](https://github.com/pactia-lang/spec) changes required
- [ ] Spec PR linked or described below
- [ ] Golden fixture synced from spec (`test/fixtures/kernel/`)

**Spec PR / notes (if any):**

## Test plan

- [ ] `npm test` passes locally
- [ ] `npm run hooks:install` — pre-commit / pre-push hooks considered
- [ ] Golden IR updated intentionally (`npm run generate:golden`) and diff reviewed
- [ ] IR JSON Schema export updated (`npm run export:ir-schemas`) if `@pactia/schema` changed
- [ ] Manual compile checked: `pactiac compile -i <file.pactia> -o /tmp/out`

**Commands / scenarios exercised:**

```bash
# paste commands or describe manual checks
```

## Breaking changes

<!-- List API, IR shape, or CLI changes. Write "None" if not applicable. -->

None
