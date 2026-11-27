import { describe, expect, it } from 'vitest';

import { type ChannelState, openingChannelState, receivePost, revealChannel } from './channel';
import { firstUnreadsAfter, scrollTopToReveal } from './unread';

describe('チャンネルごとの最初の未読の発言', () => {
  const dev = '# dev';
  const handsOn = '# ハンズオン';

  it('未読があるチャンネルに、最初の未読の発言がまだ無いときは、届いた発言を記録する', () => {
    const next = firstUnreadsAfter(new Map(), { [dev]: 1 }, { channel: dev, post: 'd1' });
    expect([...next]).toEqual([[dev, 'd1']]);
  });

  it('最初の未読の発言を記録済みのチャンネルでは、後から届いた発言で置き換えない', () => {
    const next = firstUnreadsAfter(new Map([[dev, 'd1']]), { [dev]: 2 }, { channel: dev, post: 'd2' });
    expect(next.get(dev)).toBe('d1');
  });

  it('未読が 0 のチャンネルの記録は消す', () => {
    const next = firstUnreadsAfter(
      new Map([
        [dev, 'd1'],
        [handsOn, 'h1'],
      ]),
      { [dev]: 0, [handsOn]: 1 },
      null,
    );
    expect([...next]).toEqual([[handsOn, 'h1']]);
  });

  it('未読に数えなかった発言（未読が 0 のまま）は、記録しない', () => {
    const next = firstUnreadsAfter(new Map(), { [dev]: 0 }, { channel: dev, post: 'd1' });
    expect(next.size).toBe(0);
  });

  it('A、B、A の順で届くと、A の最初の未読の発言は A の 1 件目である', () => {
    let state: ChannelState = openingChannelState(dev);
    let firsts: ReadonlyMap<string, string> = new Map();
    for (
      const [channel, post] of [
        [dev, 'a1'],
        [handsOn, 'b1'],
        [dev, 'a2'],
      ] as const
    ) {
      state = receivePost(state, { channel, self: false }, false);
      firsts = firstUnreadsAfter(firsts, state.unread, { channel, post });
    }
    expect(firsts.get(dev)).toBe('a1');
    expect(firsts.get(handsOn)).toBe('b1');
  });

  it('チャンネルの未読が 0 になったら記録が消え、その後に届いた発言が新しい最初の未読になる', () => {
    let state: ChannelState = openingChannelState(dev);
    let firsts: ReadonlyMap<string, string> = new Map();
    state = receivePost(state, { channel: dev, self: false }, false);
    firsts = firstUnreadsAfter(firsts, state.unread, { channel: dev, post: 'a1' });
    state = revealChannel(state);
    firsts = firstUnreadsAfter(firsts, state.unread, null);
    expect(firsts.has(dev)).toBe(false);
    state = receivePost(state, { channel: dev, self: false }, false);
    firsts = firstUnreadsAfter(firsts, state.unread, { channel: dev, post: 'a2' });
    expect(firsts.get(dev)).toBe('a2');
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
