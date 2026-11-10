# Project record: autocomplete-index

## Objective

Provide an in-memory autocomplete index for TypeScript that performs trie prefix search with typo tolerance by Levenshtein distance, diacritic-insensitive matching, and weighted deterministic ranking. It is intended for search boxes that need suggestions on every keystroke while tolerating bounded typos.

## Scope

In scope:

- Public API in `src/index.ts`: `AutocompleteIndex`, `normalizeTerm`, `AutocompleteError`, `Suggestion`, and option types.
- Trie storage keyed by Unicode code points of normalized terms (NFKD, combining marks removed, lowercased); original terms are stored and returned.
- Fuzzy prefix matching by minimum Levenshtein distance between the normalized query and any prefix of a normalized term, with `maxEdits` of `0`, `1`, `2`, or `"auto"`; automatic thresholds are 0 for 1–2 code points, 1 for 3–5, and 2 for 6+.
- Ranking: distance ascending, weight descending, original term ascending by code unit comparison.
- Limits and validation: terms 1–200 code points after trimming; prefix ≤200 code points; `limit` 1–100 (default 10); `maxEntries` default 100_000; weights finite ≥0.
- In-memory operation with no runtime dependencies.

Out of scope:

- Multi-word token matching.
- Persistence.
- Highlighting (pair with a UI kit).
- Transpositions as one edit.

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created from the factory utility template. |

## Effort metrics

Values are recorded from the factory ledger and time log.

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 423352 / 75459 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 0.0801 | factory ledger |

## Factory run u214 (measured from API usage)

| Date (UTC) | Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|---|
| 2026-11-10 | generation | deepseek-v4-pro | yes | 1214 | 19419 | 0 | 3584 | 0.0393 |
| 2026-11-10 | fix-1 | deepseek-flash | no | 12419 | 11947 | 0 | 118400 | 0.0094 |
| 2026-11-10 | audit | deepseek-flash | no | 16506 | 29088 | 0 | 259456 | 0.0207 |
| 2026-11-10 | docs | deepseek-flash | no | 11389 | 15005 | 0 | 384 | 0.0107 |

Total: $0.0801. Prices: deepseek line, as measured by its adapter. Providers serve the current version of each model id, so the date tells which version answered; versions, launch stages and price sources per line are in the factory's model register (docs/MODELS.md).
