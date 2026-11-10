# @trysac/autocomplete-index

In-memory autocomplete index with fuzzy prefix matching and diacritic normalization.

[![npm version](https://img.shields.io/npm/v/@trysac/autocomplete-index.svg)](https://www.npmjs.com/package/@trysac/autocomplete-index)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- Prefix search on a trie keyed by normalized Unicode code points.
- Fuzzy matching with bounded Levenshtein distance (auto thresholds: 0 edits for 1–2 code point queries, 1 for 3–5, 2 for 6+).
- Diacritic-insensitive matching via NFKD and combining mark removal.
- Deterministic ranking: distance ascending, weight descending, original term ascending.
- In-memory only; no runtime dependencies.

## Installation

```bash
npm install @trysac/autocomplete-index
```

## Usage

```typescript
import { AutocompleteIndex } from "@trysac/autocomplete-index";
const index = new AutocompleteIndex();
index.add("apple", 5);
index.add("application", 3);
index.add("apply", 4);
console.log(index.suggest("app"));
console.log(index.suggest("aple"));
```

## API

### `class AutocompleteIndex`

**Constructor**

```typescript
new AutocompleteIndex(options?: {
  maxEntries?: number;         // default 100_000
  maxEdits?: 0 | 1 | 2 | "auto"; // default "auto"
});
```

`maxEntries` must be a positive integer. `maxEdits` must be `0`, `1`, `2`, or `"auto"`.

**Methods**

- `add(term: string, weight?: number): void`  
  Adds or updates a term. Surrounding whitespace is trimmed. The term must have 1–200 code points after trimming. `weight` defaults to `1` and must be a finite number ≥ 0.
- `remove(term: string): boolean`  
  Removes the exact term (surrounding whitespace trimmed). Returns `true` if it existed, `false` otherwise, including for empty or missing terms.
- `suggest(prefix: string, opts?: { limit?: number; fuzzy?: boolean }): Suggestion[]`  
  Returns up to `limit` (default 10, valid 1–100) suggestions. `fuzzy` defaults to `true`; when `false`, only exact prefix matches (0 edits) are returned. An empty trimmed prefix returns `[]`. A trimmed prefix longer than 200 code points throws `AutocompleteError` with code `"invalid_option"`.
- `get size(): number`  
  Number of distinct original terms.

**Interface `Suggestion`**

```typescript
interface Suggestion {
  term: string;     // original term as added
  weight: number;   // associated weight
  distance: number; // Levenshtein distance to best matching prefix
}
```

### `normalizeTerm(text: string): string`

Normalizes text: NFKD, removes combining marks, lowercases. Does not trim whitespace.

### `class AutocompleteError extends Error`

Has a stable `code` property: `"invalid_term" | "invalid_weight" | "invalid_option" | "full"`.

- `"invalid_term"`: term empty or longer than 200 code points after trimming.
- `"invalid_weight"`: weight is not a finite number ≥ 0.
- `"invalid_option"`: invalid constructor option, `limit`, `fuzzy`, or prefix longer than 200 code points.
- `"full"`: adding a new term would exceed `maxEntries`.

## Why not fuzzy search libraries

General fuzzy-search libraries rank whole documents and are not built around prefixes. This index computes the minimum Levenshtein distance between the query and any prefix of a term, uses explicit bounded edit counts (0–2), and returns results in a documented deterministic order. It does not provide document ranking or multi-word token matching.

## Examples

See `docs/` for architecture, testing, project, stack and security details. Security notes: [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT
