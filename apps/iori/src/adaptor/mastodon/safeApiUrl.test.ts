import { describe, expect, it } from 'vitest';

import { toSafeApiUrl } from './safeApiUrl.ts';

const base = 'https://iori.example/api/v1/timelines/home';

describe('toSafeApiUrl', () => {
  it('keeps an absolute http or https url as it is', () => {
    expect(toSafeApiUrl('https://example.com', base)).toBe('https://example.com');
    expect(toSafeApiUrl(' http://example.com/a?b=1 ', base)).toBe('http://example.com/a?b=1');
  });

  it('turns a relative path into an absolute url on the base origin', () => {
    expect(toSafeApiUrl('/uploads/a.png', base)).toBe('https://iori.example/uploads/a.png');
  });

  it('rejects other schemes, empty values and null', () => {
    expect(toSafeApiUrl('javascript:alert(1)', base)).toBeUndefined();
    expect(toSafeApiUrl('data:text/html,x', base)).toBeUndefined();
    expect(toSafeApiUrl('', base)).toBeUndefined();
    expect(toSafeApiUrl(null, base)).toBeUndefined();
    expect(toSafeApiUrl(undefined, base)).toBeUndefined();
  });
});
