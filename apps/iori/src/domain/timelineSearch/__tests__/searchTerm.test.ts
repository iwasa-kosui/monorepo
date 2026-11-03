import { describe, expect, it } from 'vitest';

import { SearchTerm } from '../searchTerm.ts';

describe('SearchTerm', () => {
  it('NFKC で正規化し、前後の空白を除く', () => {
    const term = SearchTerm.of('  ＡＢＣ　');
    expect(term.ok).toBe(true);
    if (term.ok) expect(term.val).toBe('ABC');
  });

  it('日本語の 2 文字の語を受け付ける', () => {
    expect(SearchTerm.of('旅行').ok).toBe(true);
  });

  it('48 bytes ちょうどの語を受け付ける', () => {
    expect(SearchTerm.of('a'.repeat(48)).ok).toBe(true);
    expect(SearchTerm.of('あ'.repeat(16)).ok).toBe(true);
  });

  it.each([
    ['空', ''],
    ['空白だけ', ' 　 '],
    ['49 bytes の ASCII', 'a'.repeat(49)],
    ['49 bytes の日本語', `${'あ'.repeat(16)}a`],
    ['17 文字の日本語', 'あ'.repeat(17)],
    ['% を含む', '100%'],
    ['全角の % を含む', '100％'],
    ['_ を含む', 'a_b'],
    ['\\ を含む', 'a\\b'],
  ])('%s は不正', (_name, value) => {
    expect(SearchTerm.of(value).ok).toBe(false);
  });

  it('normalizeForMatch は NFKC と小文字化をそろえる', () => {
    expect(SearchTerm.normalizeForMatch('ＴＯＫＹＯ Ｔower')).toBe('tokyo tower');
  });
});
