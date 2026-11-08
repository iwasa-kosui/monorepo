import { describe, expect, it } from 'vitest';

import { parseTweetCreatedAt } from '../parseTweetCreatedAt.ts';

describe('parseTweetCreatedAt', () => {
  it('twitterapi.io の古典形式を Instant にする', () => {
    expect(parseTweetCreatedAt('Tue Dec 10 07:00:30 +0000 2024')).toBe(Date.UTC(2024, 11, 10, 7, 0, 30));
  });

  it.each([
    ['Wed Nov 04 20:00:00 +0900 2026', Date.UTC(2026, 10, 4, 11, 0, 0)],
    ['Wed Nov 04 20:00:00 -0530 2026', Date.UTC(2026, 10, 5, 1, 30, 0)],
    ['Thu Jan 1 00:00:00 +0000 1970', 0],
  ])('%s をオフセットを引いて UTC にそろえる', (value, expected) => {
    expect(parseTweetCreatedAt(value)).toBe(expected);
  });

  it.each([
    '',
    '2024-12-10T07:00:30.000Z',
    'Tue Dec 10 07:00:30 2024',
    'Tue Dez 10 07:00:30 +0000 2024',
    'Tue Dec 32 07:00:30 +0000 2024',
    'Tue Feb 30 07:00:30 +0000 2024',
    'Tue Dec 10 24:00:30 +0000 2024',
    'Tue Dec 10 07:60:30 +0000 2024',
    'Tue Dec 10 07:00:60 +0000 2024',
    'Tue Dec 10 07:00:30 +2400 2024',
    'Thu Jan 1 00:00:00 +0900 1970',
  ])('読めない値 %j は undefined にする', (value) => {
    expect(parseTweetCreatedAt(value)).toBeUndefined();
  });
});
