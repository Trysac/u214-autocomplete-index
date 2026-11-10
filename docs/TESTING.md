# Testing

## Tools

- [Vitest](https://vitest.dev/) is used by `test/index.test.ts` via `describe`, `expect`, and `it`.
- Tests import the public entry point with `import { AutocompleteError, AutocompleteIndex, normalizeTerm } from "../src/index.js";`.

## Commands

```sh
npx vitest run
npx vitest
```

## Rules

- Tests exercise the public entry point `src/index.ts` and assert observable behavior: returned suggestions, `size`, `remove` return values, and thrown `AutocompleteError` codes/messages.
- Each test creates a new `AutocompleteIndex`; there is no shared mutable state between tests.
- The suite is deterministic: it does not use network, clock, or randomness.

## Tiers

There is one test tier in the reviewed files: the Vitest unit suite in `test/index.test.ts`. No conformance, CI-only, or external-tool test files are present.

The suite covers:

- `normalizeTerm`: NFKD, combining-mark removal, lowercasing; no whitespace trimming.
- Basic prefix matching and ranking with `add`/`suggest`.
- Fuzzy auto thresholds: 4-character query gets 1 edit; 6+ gets 2; 1–2 code points get 0 edits.
- `fuzzy: false` disables edits.
- Diacritics and case insensitivity (`Café Lima`, `CAFÉ`).
- Deterministic ordering by distance, weight descending, term ascending.
- Duplicate `add` updates weight; `remove` return values; `size`.
- Invalid term length (0/whitespace/201, 200 accepted), invalid weights (-1, NaN, Infinity), `full` then remove then add, invalid constructor options, invalid `limit`, invalid `fuzzy`.
- Result limit default 10 and explicit 5.
- Prefix that is also a term, emoji/code point handling, distinct originals with same normalized form (`resume` / `résumé`), combining-mark prefix, explicit `maxEdits` 0/1/2, prefix >200 throws, empty prefix returns `[]`, default weight 1, remove invalid term returns `false`.

## Reports

No coverage report configuration is included in the reviewed files.
