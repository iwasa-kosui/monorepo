import { describe, expect, it } from 'vitest';

import { nextSearchCursor } from './blueskySearchPages.ts';

describe('nextSearchCursor', () => {
  it('続きがあるときは返ってきた cursor を次に使う', () => {
    expect(nextSearchCursor(undefined, 'c2', 25)).toBe('c2');
    expect(nextSearchCursor('c2', 'c3', 25)).toBe('c3');
  });

  it('cursor が null なら続きは無い', () => {
    expect(nextSearchCursor('c2', null, 25)).toBeUndefined();
  });

  it('0 件の応答や、同じ cursor が返ってきたときは続きを読まない', () => {
    expect(nextSearchCursor('c2', 'c3', 0)).toBeUndefined();
    expect(nextSearchCursor('c2', 'c2', 25)).toBeUndefined();
  });
});
