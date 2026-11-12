import { describe, expect, it } from 'vitest';

import { shouldReloadStatuses } from './remoteUserStatuses.ts';

describe('shouldReloadStatuses', () => {
  it('1 件以上取れて、続きを読み込んでいなければ読み直す', () => {
    expect([1, 20].map((fetched) => shouldReloadStatuses({ fetched }, false))).toEqual([true, true]);
  });

  it('0 件なら読み直さない', () => {
    expect(shouldReloadStatuses({ fetched: 0 }, false)).toBe(false);
  });

  it('続きを読み込み済みなら、件数があっても読み直さない', () => {
    expect(shouldReloadStatuses({ fetched: 5 }, true)).toBe(false);
  });
});
