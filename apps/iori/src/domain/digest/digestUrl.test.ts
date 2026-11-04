import { describe, expect, it } from 'vitest';

import { normalizeDigestUrl } from './digestUrl.ts';

describe('normalizeDigestUrl', () => {
  it('utm_ で始まるクエリだけを落とし、ほかのクエリは残す', () => {
    expect(normalizeDigestUrl('https://example.com/a?utm_source=x&id=1&utm_medium=y')).toBe(
      'https://example.com/a?id=1',
    );
  });

  it('クエリが utm_ だけなら ? も落とす', () => {
    expect(normalizeDigestUrl('https://example.com/a?utm_source=x&utm_campaign=y')).toBe('https://example.com/a');
  });

  it('# 以降を落とす', () => {
    expect(normalizeDigestUrl('https://example.com/a#section')).toBe('https://example.com/a');
  });

  it('パス末尾の / を落とす', () => {
    expect(normalizeDigestUrl('https://example.com/a/')).toBe('https://example.com/a');
    expect(normalizeDigestUrl('https://example.com/')).toBe('https://example.com');
  });

  it('utm_、末尾の /、# が重なっていても同じ URL にそろえる', () => {
    expect(normalizeDigestUrl('https://example.com/a/?utm_source=x&id=1#top')).toBe(
      normalizeDigestUrl('https://example.com/a?id=1'),
    );
  });

  it('ホスト名の大文字小文字をそろえる', () => {
    expect(normalizeDigestUrl('https://Example.COM/a')).toBe('https://example.com/a');
  });

  it('URL として読めない文字列と http と https 以外の URL は、そのまま返す', () => {
    expect(normalizeDigestUrl('not a url')).toBe('not a url');
    expect(normalizeDigestUrl('mailto:a@example.com')).toBe('mailto:a@example.com');
  });
});
