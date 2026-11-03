import { describe, expect, it } from 'vitest';

import { SearchTerm } from '../searchTerm.ts';
import { MAX_SEARCH_TERMS, SearchTerms } from '../searchTerms.ts';

const terms = (...values: string[]) => values.map((value) => SearchTerm.orThrow(value));

describe('SearchTerms', () => {
  it('original を先に並べる', () => {
    const result = SearchTerms.create({ original: terms('旅行'), expanded: terms('トラベル', 'trip') });
    expect(result.original).toEqual(['旅行']);
    expect(result.expanded).toEqual(['トラベル', 'trip']);
    expect(SearchTerms.toArray(result)).toEqual(['旅行', 'トラベル', 'trip']);
  });

  it('小文字にした値で重複を除く', () => {
    const result = SearchTerms.create({
      original: terms('Trip', 'trip'),
      expanded: terms('TRIP', 'Travel', 'travel'),
    });
    expect(result.original).toEqual(['Trip']);
    expect(result.expanded).toEqual(['Travel']);
  });

  it('合計 10 語までにし、original を優先する', () => {
    const original = terms(...Array.from({ length: 4 }, (_, i) => `o${i}`));
    const expanded = terms(...Array.from({ length: 12 }, (_, i) => `e${i}`));
    const result = SearchTerms.create({ original, expanded });
    expect(MAX_SEARCH_TERMS).toBe(10);
    expect(SearchTerms.toArray(result)).toHaveLength(10);
    expect(result.original).toHaveLength(4);
    expect(result.expanded).toEqual(expanded.slice(0, 6));
  });

  it('original だけで 10 語を超えると expanded は空になる', () => {
    const original = terms(...Array.from({ length: 11 }, (_, i) => `o${i}`));
    const result = SearchTerms.create({ original, expanded: terms('x') });
    expect(result.original).toHaveLength(10);
    expect(result.expanded).toEqual([]);
  });

  it('語がなければ isEmpty が true', () => {
    expect(SearchTerms.isEmpty(SearchTerms.create({ original: [], expanded: [] }))).toBe(true);
    expect(SearchTerms.isEmpty(SearchTerms.create({ original: terms('a'), expanded: [] }))).toBe(false);
  });
});
