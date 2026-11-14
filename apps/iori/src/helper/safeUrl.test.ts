import { describe, expect, it } from 'vitest';

import { safeAbsoluteUrl, safeUrl } from './safeUrl.ts';

describe('safeUrl', () => {
  it.each([
    ['https://example.com/a.png'],
    ['http://example.com/a.png'],
    ['/uploads/a.png'],
  ])('returns %s as is', (value) => {
    expect(safeUrl(value)).toBe(value);
  });

  it('keeps query and fragment of a relative path', () => {
    expect(safeUrl('/uploads/a.png?x=1#y')).toBe('/uploads/a.png?x=1#y');
  });

  it('trims surrounding whitespace', () => {
    expect(safeUrl('  https://example.com/a.png ')).toBe('https://example.com/a.png');
  });

  it.each([
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    [' javascript:alert(1)'],
    ['data:image/png;base64,AAAA'],
    ['vbscript:msgbox(1)'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['/\t/evil.example'],
    ['/\n/evil.example'],
    [null],
    ['not a url'],
  ])('returns undefined for %s', (value) => {
    expect(safeUrl(value)).toBeUndefined();
  });
});

describe('safeAbsoluteUrl', () => {
  it.each([
    ['https://example.com/a.png'],
    ['http://example.com/a.png'],
  ])('returns %s as is', (value) => {
    expect(safeAbsoluteUrl(value)).toBe(value);
  });

  it.each([
    ['/uploads/a.png'],
    ['javascript:alert(1)'],
    ['//evil.example'],
    [null],
  ])('returns undefined for %s', (value) => {
    expect(safeAbsoluteUrl(value)).toBeUndefined();
  });
});
