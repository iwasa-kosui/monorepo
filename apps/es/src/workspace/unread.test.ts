import { describe, expect, it } from 'vitest';

import { firstUnreadOf, scrollTopToReveal } from './unread';

describe('最初の未読の発言', () => {
  it('覚えている発言が無いときは、新しい発言を覚える', () => {
    expect(firstUnreadOf<string>(null, false, 'b')).toBe('b');
  });

  it('覚えている発言が一覧から外れたときは、新しい発言に置き換える', () => {
    expect(firstUnreadOf('a', false, 'b')).toBe('b');
  });

  it('覚えている発言が一覧にあるときは、そのまま覚えておく', () => {
    expect(firstUnreadOf('a', true, 'b')).toBe('a');
  });
});

describe('チャットを開いたときの一覧の位置', () => {
  const base = { feedTop: 100, paddingTop: 12, scrollHeight: 900, toEnd: false };

  it('最初の未読の発言の先頭を、一覧の上端（padding の内側）に合わせる', () => {
    const scrollTop = scrollTopToReveal({ ...base, scrollTop: 0, targetTop: 500 });
    expect(scrollTop).toBe(388);
  });

  it('一覧が途中までスクロールされていても、同じ位置に合わせる', () => {
    const scrollTop = scrollTopToReveal({ ...base, scrollTop: 300, targetTop: 200 });
    expect(scrollTop).toBe(388);
  });

  it('最初の未読の発言が無く、末尾へ送る指定のときは、末尾の位置にする', () => {
    const scrollTop = scrollTopToReveal({ ...base, scrollTop: 40, targetTop: null, toEnd: true });
    expect(scrollTop).toBe(900);
  });

  it('最初の未読の発言が無く、末尾へ送らない指定のときは、位置を変えない', () => {
    const scrollTop = scrollTopToReveal({ ...base, scrollTop: 40, targetTop: null });
    expect(scrollTop).toBe(40);
  });
});
