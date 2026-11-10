import { describe, expect, it } from "vitest";
import { AutocompleteError, AutocompleteIndex, normalizeTerm } from "../src/index.js";

function cp(s: string): number {
  return Array.from(s).length;
}

describe("normalizeTerm", () => {
  it("applies NFKD, removes combining marks, and lowercases", () => {
    expect(normalizeTerm("Café")).toBe("cafe");
    expect(normalizeTerm("ĜŬkÀ")).toBe("guka");
    expect(normalizeTerm("Straße")).toBe("straße"); // ß does not decompose; only lowercasing applies
  });

  it("does not trim whitespace", () => {
    expect(normalizeTerm("  a  ")).toBe("  a  ");
  });
});

describe("AutocompleteIndex", () => {
  it("basic behavior with exact prefix matches and ranking", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 5);
    idx.add("application", 3);
    idx.add("apply", 4);
    idx.add("banana", 9);

    const suggestions = idx.suggest("app");
    expect(suggestions).toEqual([
      { term: "apple", weight: 5, distance: 0 },
      { term: "apply", weight: 4, distance: 0 },
      { term: "application", weight: 3, distance: 0 },
    ]);
  });

  it("fuzzy matching with auto maxEdits for 4-character prefix", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 5);
    idx.add("application", 3);
    idx.add("apply", 4);
    idx.add("banana", 9);

    expect(idx.suggest("aple")).toEqual([{ term: "apple", weight: 5, distance: 1 }]);
  });

  it("auto maxEdits=2 for 6+ characters", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 5);
    idx.add("application", 3);
    idx.add("apply", 4);
    idx.add("banana", 9);

    expect(idx.suggest("aplication")).toEqual([{ term: "application", weight: 3, distance: 1 }]);
  });

  it("fuzzy: false disables edits", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 5);
    idx.add("application", 3);
    idx.add("apply", 4);
    idx.add("banana", 9);

    expect(idx.suggest("aple", { fuzzy: false })).toEqual([]);
  });

  it("handles diacritics and case insensitivity", () => {
    const idx = new AutocompleteIndex();
    idx.add("Café Lima", 2);

    expect(idx.suggest("cafe")).toEqual([{ term: "Café Lima", weight: 2, distance: 0 }]);
    expect(idx.suggest("CAFÉ")).toEqual([{ term: "Café Lima", weight: 2, distance: 0 }]);
  });

  it("deterministic ordering: distance, weight desc, term asc", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 7);
    idx.add("apply", 4);
    idx.add("application", 3);
    idx.add("apricot", 5);

    const suggestions = idx.suggest("ap");
    expect(suggestions.map((s) => s.term)).toEqual(["apple", "apricot", "apply", "application"]);
    expect(suggestions.every((s) => s.distance === 0)).toBe(true);

    // equal distance: weight descending, then term ascending
    const idx2 = new AutocompleteIndex();
    idx2.add("ab", 1);
    idx2.add("aa", 1);
    idx2.add("ac", 2);
    const suggestions2 = idx2.suggest("a", { fuzzy: false });
    expect(suggestions2.every((s) => s.distance === 0)).toBe(true);
    expect(suggestions2.map((s) => s.term)).toEqual(["ac", "aa", "ab"]);
  });

  it("updates weight on duplicate add", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 5);
    idx.add("apple", 7);
    expect(idx.size).toBe(1);
    expect(idx.suggest("app")).toEqual([{ term: "apple", weight: 7, distance: 0 }]);
  });

  it("remove returns false for missing, true for existing", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 5);
    expect(idx.remove("banana")).toBe(false);
    expect(idx.remove("apple")).toBe(true);
    expect(idx.size).toBe(0);
    expect(idx.suggest("app")).toEqual([]);
  });

  it("size reflects distinct original terms", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 1);
    idx.add("banana", 1);
    expect(idx.size).toBe(2);
    idx.add("apple", 2); // update
    expect(idx.size).toBe(2);
    idx.remove("apple");
    expect(idx.size).toBe(1);
  });

  it("throws invalid_term for empty or >200 code points", () => {
    const idx = new AutocompleteIndex();
    expect(() => idx.add("")).toThrowError(
      new AutocompleteError("invalid_term", "term must have 1 to 200 code points after trimming"),
    );
    expect(() => idx.add("   ")).toThrowError(
      new AutocompleteError("invalid_term", "term must have 1 to 200 code points after trimming"),
    );
    const long = "a".repeat(201);
    expect(() => idx.add(long)).toThrowError(
      new AutocompleteError("invalid_term", "term must have 1 to 200 code points after trimming"),
    );
    // 200 code points is accepted
    const ok = "a".repeat(200);
    idx.add(ok);
    expect(idx.size).toBe(1);
  });

  it("throws invalid_weight for non-finite or negative weights", () => {
    const idx = new AutocompleteIndex();
    expect(() => idx.add("a", -1)).toThrowError(
      new AutocompleteError("invalid_weight", "weight must be a finite number >= 0"),
    );
    expect(() => idx.add("a", Number.NaN)).toThrowError(
      new AutocompleteError("invalid_weight", "weight must be a finite number >= 0"),
    );
    expect(() => idx.add("a", Number.POSITIVE_INFINITY)).toThrowError(
      new AutocompleteError("invalid_weight", "weight must be a finite number >= 0"),
    );
  });

  it("throws full when maxEntries reached, recover after remove", () => {
    const idx = new AutocompleteIndex({ maxEntries: 1 });
    idx.add("one", 1);
    expect(() => idx.add("two", 1)).toThrowError(
      new AutocompleteError("full", "cannot add new term: index is full"),
    );
    idx.remove("one");
    idx.add("two", 2);
    expect(idx.size).toBe(1);
  });

  it("throws invalid_option for invalid limit", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 1);
    expect(() => idx.suggest("ap", { limit: 0 })).toThrowError(
      new AutocompleteError("invalid_option", "limit must be an integer between 1 and 100"),
    );
    expect(() => idx.suggest("ap", { limit: 101 })).toThrowError(
      new AutocompleteError("invalid_option", "limit must be an integer between 1 and 100"),
    );
    expect(() => idx.suggest("ap", { limit: 1.5 })).toThrowError(
      new AutocompleteError("invalid_option", "limit must be an integer between 1 and 100"),
    );
  });

  it("throws invalid_option for invalid fuzzy option", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 1);
    expect(() => idx.suggest("ap", { fuzzy: "yes" as unknown as boolean })).toThrowError(
      new AutocompleteError("invalid_option", "fuzzy must be a boolean"),
    );
  });

  it("returns at most limit results (default 10)", () => {
    const idx = new AutocompleteIndex();
    for (let i = 0; i < 20; i++) {
      idx.add(`a${i}`, 1);
    }
    const suggestions = idx.suggest("a", { limit: 5 });
    expect(suggestions).toHaveLength(5);
    const defaultSuggestions = idx.suggest("a");
    expect(defaultSuggestions).toHaveLength(10);
  });

  it("auto maxEdits: prefixes of 1-2 code points disable edits", () => {
    const idx = new AutocompleteIndex();
    idx.add("zap", 1);
    // 'zp' length 2; auto maxEdits=0, so no fuzzy match
    expect(idx.suggest("zp")).toEqual([]);
    // 'ap' length 2, exact prefix matches
    idx.add("apple", 5);
    idx.add("application", 3);
    idx.add("apply", 4);
    expect(idx.suggest("ap").map((s) => s.term)).toEqual(["apple", "apply", "application"]);
  });

  it("prefix being a term that is also prefix of another", () => {
    const idx = new AutocompleteIndex();
    idx.add("car", 1);
    idx.add("cart", 2);
    const suggestions = idx.suggest("car");
    expect(suggestions).toEqual([
      { term: "cart", weight: 2, distance: 0 },
      { term: "car", weight: 1, distance: 0 },
    ]);
  });

  it("emoji terms using code point keys", () => {
    const idx = new AutocompleteIndex();
    idx.add("😀😀", 3);
    const suggestions = idx.suggest("😀");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({
      term: "😀😀",
      weight: 3,
      distance: 0,
    });
  });

  it("distinct originals with same normalized form", () => {
    const idx = new AutocompleteIndex();
    idx.add("resume", 1);
    idx.add("r\u00e9sum\u00e9", 2); // "résumé"
    const suggestions = idx.suggest("resume");
    expect(suggestions).toEqual([
      { term: "r\u00e9sum\u00e9", weight: 2, distance: 0 },
      { term: "resume", weight: 1, distance: 0 },
    ]);
  });

  it("prefix with combining marks normalizes correctly", () => {
    const idx = new AutocompleteIndex();
    idx.add("café", 2);
    expect(idx.suggest("caf\u00e9")).toEqual([{ term: "café", weight: 2, distance: 0 }]);
  });

  it("constructor invalid options", () => {
    expect(() => new AutocompleteIndex({ maxEntries: 0 })).toThrowError(
      new AutocompleteError("invalid_option", "maxEntries must be a positive integer"),
    );
    expect(() => new AutocompleteIndex({ maxEntries: 1.5 })).toThrowError(
      new AutocompleteError("invalid_option", "maxEntries must be a positive integer"),
    );
    expect(() => new AutocompleteIndex({ maxEdits: 3 as never })).toThrowError(
      new AutocompleteError("invalid_option", "maxEdits must be 0, 1, 2, or 'auto'"),
    );
  });

  it("explicit maxEdits of 0,1,2", () => {
    // maxEdits=0: exact only
    const idx0 = new AutocompleteIndex({ maxEdits: 0 });
    idx0.add("apple", 1);
    expect(idx0.suggest("aple")).toEqual([]);
    expect(idx0.suggest("app").length).toBeGreaterThan(0);

    const idx1 = new AutocompleteIndex({ maxEdits: 1 });
    idx1.add("apple", 1);
    idx1.add("application", 2);
    expect(idx1.suggest("aple")).toEqual([{ term: "apple", weight: 1, distance: 1 }]);

    const idx2 = new AutocompleteIndex({ maxEdits: 2 });
    idx2.add("apple", 1);
    idx2.add("application", 2);
    expect(idx2.suggest("aplication")).toEqual([{ term: "application", weight: 2, distance: 1 }]);
  });

  it("prefix longer than 200 code points throws invalid_option", () => {
    const idx = new AutocompleteIndex();
    const longPrefix = "a".repeat(201);
    expect(() => idx.suggest(longPrefix)).toThrowError(
      new AutocompleteError("invalid_option", "prefix must have at most 200 code points"),
    );
  });

  it("empty prefix returns [] without error", () => {
    const idx = new AutocompleteIndex();
    idx.add("apple", 1);
    expect(idx.suggest("")).toEqual([]);
    expect(idx.suggest("   ")).toEqual([]);
  });

  it("weight default is 1", () => {
    const idx = new AutocompleteIndex();
    idx.add("test");
    const suggestions = idx.suggest("te");
    expect(suggestions).toEqual([{ term: "test", weight: 1, distance: 0 }]);
  });

  it("code point length count is used (not UTF-16 units)", () => {
    // Emoji has length 2 in UTF-16 but 1 code point
    expect(cp("😀")).toBe(1);
    const idx = new AutocompleteIndex();
    idx.add("😀😀😀", 1); // 3 code points
    expect(idx.size).toBe(1);
    // 200 emoji = 200 code points, valid
    const manyEmojis = "😀".repeat(200);
    idx.add(manyEmojis);
    expect(idx.size).toBe(2);
  });

  it("remove with invalid term returns false", () => {
    const idx = new AutocompleteIndex();
    expect(idx.remove("")).toBe(false);
    expect(idx.remove("   ")).toBe(false);
    const long = "a".repeat(201);
    expect(idx.remove(long)).toBe(false);
  });
});
