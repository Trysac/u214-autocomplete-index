# Trie-based fuzzy prefix autocomplete with per-node Levenshtein DP rows

Status: accepted (generated, pending human review)

## Context

Need in-memory autocomplete that tolerates typos and diacritic variations while providing deterministic ranking. The spec requires bounded Levenshtein distance between query prefix and any prefix of a term, with automatic edit distance thresholds based on query length, and no external dependencies.

## Decision

Store terms in a trie keyed by normalized Unicode code points. During suggest, perform a depth-first traversal carrying a single dynamic programming row per node representing the edit distance to the current prefix. Prune branches only when the candidate length exceeds query length plus maxEdits (a sound lower bound). Use Elasticsearch AUTO thresholds for automatic maxEdits. Rank by distance asc, weight desc, original term asc. Each terminal node may hold multiple original terms sharing the same normalized form, distinguished by original string.

## Consequences

Fast prefix retrieval O(prefix length + matches). Fuzzy search explores a limited subtree bounded by length difference, keeping performance acceptable. No runtime dependencies. Slight memory overhead from storing original terms separately at terminal nodes for diacritic-preserving output.
