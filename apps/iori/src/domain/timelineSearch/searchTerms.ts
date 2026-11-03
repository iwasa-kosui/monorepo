import { SearchTerm } from './searchTerm.ts';

export const MAX_SEARCH_TERMS = 10;
export const ORIGINAL_PATTERN_WEIGHT = 2;
export const EXPANDED_PATTERN_WEIGHT = 1;

export type SearchTerms = Readonly<{
  original: ReadonlyArray<SearchTerm>;
  expanded: ReadonlyArray<SearchTerm>;
}>;

export type WeightedPattern = Readonly<{
  pattern: string;
  weight: number;
}>;

const create = (
  input: Readonly<{ original: ReadonlyArray<SearchTerm>; expanded: ReadonlyArray<SearchTerm> }>,
): SearchTerms => {
  const seen = new Set<string>();
  const pick = (terms: ReadonlyArray<SearchTerm>): SearchTerm[] => {
    const picked: SearchTerm[] = [];
    for (const term of terms) {
      if (seen.size >= MAX_SEARCH_TERMS) break;
      const key = SearchTerm.normalizeForMatch(term.normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(term);
    }
    return picked;
  };
  const original = pick(input.original);
  const expanded = pick(input.expanded);
  return { original, expanded };
};

const toArray = (terms: SearchTerms): ReadonlyArray<SearchTerm> => [...terms.original, ...terms.expanded];

const isEmpty = (terms: SearchTerms): boolean => terms.original.length === 0 && terms.expanded.length === 0;

const toPatterns = (terms: SearchTerms): ReadonlyArray<WeightedPattern> => {
  const weights = new Map<string, number>();
  const add = (list: ReadonlyArray<SearchTerm>, weight: number): void => {
    for (const term of list) {
      for (const pattern of SearchTerm.patterns(term)) {
        weights.set(pattern, Math.max(weights.get(pattern) ?? 0, weight));
      }
    }
  };
  add(terms.original, ORIGINAL_PATTERN_WEIGHT);
  add(terms.expanded, EXPANDED_PATTERN_WEIGHT);
  return [...weights].map(([pattern, weight]) => ({ pattern, weight }));
};

export const SearchTerms = {
  create,
  toArray,
  isEmpty,
  toPatterns,
} as const;
