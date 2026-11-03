import { describe, expect, it } from 'vitest';

import { SearchTerm } from '../searchTerm.ts';
import { MAX_SEARCH_TERMS, SearchTerms } from '../searchTerms.ts';

const terms = (...values: string[]) => values.map((value) => SearchTerm.orThrow(value));
const normalized = (list: ReadonlyArray<SearchTerm>) => list.map((term) => term.normalized);

describe('SearchTerms', () => {
  it('original を先に並べる', () => {
    const result = SearchTerms.create({ original: terms('旅行'), expanded: terms('トラベル', 'trip') });
    expect(normalized(result.original)).toEqual(['旅行']);
    expect(normalized(result.expanded)).toEqual(['トラベル', 'trip']);
    expect(normalized(SearchTerms.toArray(result))).toEqual(['旅行', 'トラベル', 'trip']);
  });

  it('小文字にした値で重複を除く', () => {
    const result = SearchTerms.create({
      original: terms('Trip', 'trip'),
      expanded: terms('TRIP', 'Travel', 'travel'),
    });
    expect(normalized(result.original)).toEqual(['Trip']);
    expect(normalized(result.expanded)).toEqual(['Travel']);
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

  it('original の pattern は weight 2、expanded の pattern は weight 1 にする', () => {
    const result = SearchTerms.create({ original: terms('旅行'), expanded: terms('trip') });
    expect(SearchTerms.toPatterns(result)).toEqual([
      { pattern: '旅行', weight: 2 },
      { pattern: 'trip', weight: 1 },
    ]);
  });

  it('正規化の前後の値をどちらも pattern にする', () => {
    const result = SearchTerms.create({ original: terms('ＴＲＩＰ'), expanded: [] });
    expect(SearchTerms.toPatterns(result)).toEqual([
      { pattern: 'ＴＲＩＰ', weight: 2 },
      { pattern: 'TRIP', weight: 2 },
    ]);
  });

  it('同じ pattern が original と expanded に出たら大きい weight を残す', () => {
    const result = SearchTerms.create({ original: terms('Ｔｒｉｐ'), expanded: terms('Trip') });
    expect(SearchTerms.toPatterns(result)).toEqual([
      { pattern: 'Ｔｒｉｐ', weight: 2 },
      { pattern: 'Trip', weight: 2 },
    ]);
  });

  it('語がなければ pattern も空になる', () => {
    expect(SearchTerms.toPatterns(SearchTerms.create({ original: [], expanded: [] }))).toEqual([]);
  });
});
