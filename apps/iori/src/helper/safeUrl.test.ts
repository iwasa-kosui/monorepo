import { describe, expect, it } from 'vitest';

import { safeUrl } from './safeUrl.ts';

describe('safeUrl', () => {
  it.each([
    ['https://example.com/a.png'],
    ['http://example.com/a.png'],
    ['/uploads/a.png'],
  ])('returns %s as is', (value) => {
    expect(safeUrl(value)).toBe(value);
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
    [''],
    [null],
    [undefined],
    ['not a url'],
  ])('returns undefined for %s', (value) => {
    expect(safeUrl(value)).toBeUndefined();
  });
});
