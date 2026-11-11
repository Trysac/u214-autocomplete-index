# Security practices

This document describes the runtime threat model and security limits of `@trysac/autocomplete-index`. The library is an in-memory index; it has no network, file, or database access.

## Secrets

- The library reads no environment variables or credentials and performs no I/O.
- No secrets, tokens, or credentials are part of the package or its runtime behavior.

## Dependencies

- Runtime dependencies: none. All matching code executes in-process.
- Because there are no runtime dependencies, third-party packages do not run as part of the library.

## Code

- No `eval`, dynamic `Function` construction, or shelling out.
- Caller input is validated before use:
  - `add` rejects empty or >200 code point terms with `AutocompleteError` code `"invalid_term"`.
  - `add` rejects non-finite or negative weights with code `"invalid_weight"`.
  - Constructor options, `limit`, `fuzzy`, and prefixes >200 code points are rejected with code `"invalid_option"`.
  - Adding a new term beyond `maxEntries` throws code `"full"`.
- Terms are normalized with `String.prototype.normalize("NFKD")`, combining marks removed, and lowercased. The trimmed original string is stored and returned.

## Threat model

### Defended

- Term and prefix data are treated as strings; they cannot execute code.
- Invalid input and options fail with stable `AutocompleteError` codes instead of being silently accepted.
- `maxEntries` bounds the number of distinct original terms (default 100_000; must be a positive integer). Each term is limited to 200 code points, so indexed code point data is bounded by those two limits apart from object/map overhead.
- `suggest` limits results to 1–100 (default 10), prefix length to 200 code points, and edit distance to 0–2 (`maxEdits` or automatic thresholds).
- Ranking is deterministic: distance ascending, weight descending, original term ascending by code unit comparison.

### Not defended

- No authentication, authorization, rate limiting, or tenant isolation. Callers control the process and its inputs.
- No persistence; all terms are lost when the process exits.
- No HTML/UI escaping. Returned `term` values are original input strings and must be escaped by the display layer.
- `maxEntries` has no upper bound beyond being a positive integer; a caller can choose a very large value.
- No hard byte-level memory cap, timeout, or cancellation. The limits above bound term count and term length, not object/map overhead or total process memory.
- No multi-word token matching, highlighting, persistence, or transposition-as-one-edit handling.

## Publishing

- Distributed as the public OSS package `@trysac/autocomplete-index` for Node.js 20+, as ES modules with type declarations.
- The package contains no runtime dependencies and no secrets.
