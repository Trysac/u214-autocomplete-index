# Architecture

## Overview

`@trysac/autocomplete-index` is a dependency-free TypeScript ESM library for Node.js 20+. It stores terms in an in-memory trie keyed by Unicode code points of normalized terms. Fuzzy prefix suggestions are computed by a depth-first walk that carries one Levenshtein dynamic-programming row per trie node and prunes when the best distance found so far and the row minimum both exceed the allowed edit distance.

## Modules

| Module | Responsibility |
|---|---|
| `src/index.ts` | Public API and implementation: `AutocompleteIndex`, `normalizeTerm`, `AutocompleteError`, `Suggestion`, `AutocompleteIndexOptions`, `SuggestOptions`, `AutocompleteErrorCode`. |
| `test/index.test.ts` | Vitest unit tests for normalization, indexing, fuzzy matching, ranking, limits, and errors. |

## Boundaries

- No runtime dependencies.
- No I/O at import time or during operations; all state is in memory and is lost when the process exits.
- Terms are stored under normalized keys (NFKD, combining marks removed, lowercased); the trimmed original term is stored and returned.
- Validation failures throw `AutocompleteError` with stable `code` values, not built-in `TypeError` or `RangeError`.
- Fuzzy matching is bounded by `maxEdits` (`0`, `1`, `2`, or `"auto"`), prefix length ≤200 code points, and result limit 1–100.
- Out of scope: multi-word token matching, persistence, highlighting, and transpositions as one edit.

## Build and distribution

The library is a public OSS TypeScript ESM package for Node.js 20+ with type declarations. Consumers import from `@trysac/autocomplete-index`; the public entry point in the source is `src/index.ts`. There are no runtime dependencies.

## Decisions

No architecture decision records are included in the reviewed files.
