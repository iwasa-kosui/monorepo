import { SearchTerm } from './searchTerm.ts';

export const MAX_SEARCH_TERMS = 10;

export type SearchTerms = Readonly<{
  original: ReadonlyArray<SearchTerm>;
  expanded: ReadonlyArray<SearchTerm>;
}>;

const create = (
  input: Readonly<{ original: ReadonlyArray<SearchTerm>; expanded: ReadonlyArray<SearchTerm> }>,
): SearchTerms => {
  const seen = new Set<string>();
  const pick = (terms: ReadonlyArray<SearchTerm>): SearchTerm[] => {
    const picked: SearchTerm[] = [];
    for (const term of terms) {
      if (seen.size >= MAX_SEARCH_TERMS) break;
      const key = SearchTerm.normalizeForMatch(term);
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

export const SearchTerms = {
  create,
  toArray,
  isEmpty,
} as const;
