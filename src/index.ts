/**
 * In-memory autocomplete index with fuzzy prefix matching and diacritic normalization.
 *
 * Terms are stored in a trie keyed by normalized code points. Suggestion search walks
 * the trie with a dynamic programming row for Levenshtein distance against the query
 * prefix, tracking the best distance to any prefix of each term and pruning branches
 * whose row minimum already exceeds maxEdits.
 */

/** Error codes emitted by {@link AutocompleteError}. */
export type AutocompleteErrorCode = "invalid_term" | "invalid_weight" | "invalid_option" | "full";

/**
 * Error thrown for invalid input, options, or when the index is full.
 * The `code` property is a stable machine-readable string.
 */
export class AutocompleteError extends Error {
  readonly code: AutocompleteErrorCode;

  constructor(code: AutocompleteErrorCode, message: string) {
    super(message);
    this.name = "AutocompleteError";
    this.code = code;
    Object.setPrototypeOf(this, AutocompleteError.prototype);
  }
}

/** A suggestion returned by {@link AutocompleteIndex.suggest}. */
export interface Suggestion {
  /** The original term as added (preserving diacritics and case). */
  term: string;
  /** The weight associated with the term. */
  weight: number;
  /** Levenshtein distance between the normalized query prefix and the best matching prefix of the normalized term. */
  distance: number;
}

/** Helper to count code points in a string. */
function codePointLength(text: string): number {
  return Array.from(text).length;
}

/**
 * Normalizes a string for matching: NFKD compatibility decomposition,
 * removal of combining marks, and lowercasing.
 *
 * @param text - Input text. Surrounding whitespace is not trimmed.
 * @returns The normalized form.
 */
export function normalizeTerm(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

interface TrieNode {
  children: Map<string, TrieNode>;
  /** Map from original term to weight. Multiple originals may share the same normalized key. */
  entries: Map<string, number>;
}

function createNode(): TrieNode {
  return { children: new Map(), entries: new Map() };
}

/** Options for constructing an {@link AutocompleteIndex}. */
export interface AutocompleteIndexOptions {
  /** Maximum number of unique terms stored. Default 100_000. Must be a positive integer. */
  maxEntries?: number;
  /**
   * Maximum edit distance for fuzzy matching. `0`, `1`, `2`, or `"auto"`.
   * Default `"auto"`, which selects the maximum based on the query prefix length
   * (Elasticsearch AUTO fuzziness: 0 for 1-2 code points, 1 for 3-5, 2 for 6+).
   */
  maxEdits?: 0 | 1 | 2 | "auto";
}

/** Options for {@link AutocompleteIndex.suggest}. */
export interface SuggestOptions {
  /** Maximum number of results to return, 1-100 inclusive. Default 10. */
  limit?: number;
  /** Enable fuzzy matching. Default true. If false, only exact prefix matches. */
  fuzzy?: boolean;
}

/**
 * In-memory autocomplete index.
 *
 * @example
 * ```typescript
 * import { AutocompleteIndex } from "@trysac/autocomplete-index";
 * const index = new AutocompleteIndex();
 * index.add("apple", 5);
 * index.add("application", 3);
 * index.suggest("aple"); // [{ term: "apple", weight: 5, distance: 1 }]
 * ```
 */
export class AutocompleteIndex {
  private readonly root: TrieNode;
  private readonly maxEntries: number;
  private readonly maxEdits: 0 | 1 | 2 | "auto";
  private entryCount = 0;

  constructor(opts: AutocompleteIndexOptions = {}) {
    const { maxEntries = 100_000, maxEdits = "auto" } = opts;

    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new AutocompleteError("invalid_option", "maxEntries must be a positive integer");
    }
    if (maxEdits !== "auto" && maxEdits !== 0 && maxEdits !== 1 && maxEdits !== 2) {
      throw new AutocompleteError("invalid_option", "maxEdits must be 0, 1, 2, or 'auto'");
    }

    this.root = createNode();
    this.maxEntries = maxEntries;
    this.maxEdits = maxEdits;
  }

  /**
   * Adds or updates a term in the index.
   *
   * @param term - The term to index. Surrounding whitespace is trimmed.
   * @param weight - Non-negative finite number. Default 1.
   * @throws {AutocompleteError} If the term is empty or longer than 200 code points (`code: "invalid_term"`),
   * if the weight is not a finite non-negative number (`code: "invalid_weight"`),
   * or if adding a new term would exceed `maxEntries` (`code: "full"`).
   */
  add(term: string, weight = 1): void {
    const trimmed = term.trim();
    if (trimmed.length === 0 || codePointLength(trimmed) > 200) {
      throw new AutocompleteError(
        "invalid_term",
        "term must have 1 to 200 code points after trimming",
      );
    }
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      throw new AutocompleteError("invalid_weight", "weight must be a finite number >= 0");
    }

    const normalized = normalizeTerm(trimmed);
    const codePoints = Array.from(normalized);
    let node = this.root;
    for (const ch of codePoints) {
      let child = node.children.get(ch);
      if (!child) {
        child = createNode();
        node.children.set(ch, child);
      }
      node = child;
    }

    if (!node.entries.has(trimmed)) {
      if (this.entryCount >= this.maxEntries) {
        throw new AutocompleteError("full", "cannot add new term: index is full");
      }
      this.entryCount++;
    }
    node.entries.set(trimmed, weight);
  }

  /**
   * Removes a term from the index.
   *
   * @param term - The exact term to remove (surrounding whitespace trimmed).
   * @returns `true` if the term existed and was removed; `false` otherwise.
   */
  remove(term: string): boolean {
    const trimmed = term.trim();
    if (trimmed.length === 0) return false;

    const normalized = normalizeTerm(trimmed);
    const codePoints = Array.from(normalized);
    let node: TrieNode | undefined = this.root;
    for (const ch of codePoints) {
      node = node?.children.get(ch);
      if (!node) return false;
    }

    if (node.entries.delete(trimmed)) {
      this.entryCount--;
      return true;
    }
    return false;
  }

  /** Number of distinct terms currently stored. */
  get size(): number {
    return this.entryCount;
  }

  /**
   * Returns suggestions for a prefix.
   *
   * @param prefix - The query prefix. Surrounding whitespace is trimmed. An empty
   * trimmed prefix returns an empty array.
   * @param opts - Options controlling fuzzy matching and result limit.
   * @returns An array of suggestions sorted by distance ascending, weight descending,
   * then original term ascending by code unit comparison.
   * @throws {AutocompleteError} If prefix has more than 200 code points after trimming
   * or if options are invalid (`code: "invalid_option"`).
   */
  suggest(prefix: string, opts: SuggestOptions = {}): Suggestion[] {
    const trimmedPrefix = prefix.trim();
    if (trimmedPrefix === "") return [];

    const normalizedPrefix = normalizeTerm(trimmedPrefix);
    const prefixCodePoints = Array.from(normalizedPrefix);
    if (prefixCodePoints.length === 0) return [];
    if (prefixCodePoints.length > 200) {
      throw new AutocompleteError("invalid_option", "prefix must have at most 200 code points");
    }

    const { limit = 10, fuzzy = true } = opts;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AutocompleteError("invalid_option", "limit must be an integer between 1 and 100");
    }
    if (typeof fuzzy !== "boolean") {
      throw new AutocompleteError("invalid_option", "fuzzy must be a boolean");
    }

    let maxAllowedEdits: number;
    if (!fuzzy) {
      maxAllowedEdits = 0;
    } else if (typeof this.maxEdits === "number") {
      maxAllowedEdits = this.maxEdits;
    } else {
      const len = prefixCodePoints.length;
      if (len <= 2) {
        maxAllowedEdits = 0;
      } else if (len <= 5) {
        maxAllowedEdits = 1;
      } else {
        maxAllowedEdits = 2;
      }
    }

    const results: Suggestion[] = [];
    const query = prefixCodePoints;
    const initialRow: number[] = Array.from({ length: query.length + 1 }, (_, i) => i);
    const initialMinPathDist = initialRow[query.length]!;

    const dfs = (node: TrieNode, row: number[], minPathDist: number): void => {
      // Terminal entries at this node
      if (node.entries.size > 0 && minPathDist <= maxAllowedEdits) {
        for (const [original, weight] of node.entries) {
          results.push({ term: original, weight, distance: minPathDist });
        }
      }

      // Explore children
      for (const [ch, child] of node.children) {
        const newRow: number[] = new Array(query.length + 1);
        newRow[0] = row[0]! + 1; // candidate length increased
        for (let j = 1; j <= query.length; j++) {
          const cost = query[j - 1] === ch ? 0 : 1;
          newRow[j] = Math.min(newRow[j - 1]! + 1, row[j]! + 1, row[j - 1]! + cost);
        }
        const childDist = newRow[query.length]!;
        const childMinPathDist = Math.min(minPathDist, childDist);

        // Prune when no prefix of any descendant term can be within maxEdits:
        // every value of `newRow` is a lower bound for all rows deeper in the
        // subtree, so if both the row minimum and the best distance found on the
        // path so far exceed maxEdits, the subtree cannot contain a match.
        let rowMin = Number.POSITIVE_INFINITY;
        for (let j = 0; j <= query.length; j++) {
          if (newRow[j]! < rowMin) rowMin = newRow[j]!;
        }
        if (minPathDist > maxAllowedEdits && rowMin > maxAllowedEdits) {
          continue;
        }

        dfs(child, newRow, childMinPathDist);
      }
    };

    dfs(this.root, initialRow, initialMinPathDist);

    results.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.term < b.term ? -1 : a.term > b.term ? 1 : 0;
    });

    return results.slice(0, limit);
  }
}
