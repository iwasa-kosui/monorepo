import { describe, expect, it } from 'vitest';

import {
  channelOfPost,
  type ChannelState,
  openingChannel,
  openingChannelState,
  openingSchedule,
  placeholderOf,
  postsInChannel,
  receivePost,
  receiveTyping,
  selectChannel,
  typingLeadMs,
  typingStartMs,
  typingVisible,
  unreadOf,
} from './channel';
import type { Post, TimelineEvent } from './scenario';

const inquiryChannel = '# 問い合わせ対応';
const handsOn = '# ハンズオン';

const support = (text: string): Post => ({ actor: 'support', text });
const presenter = (text: string): Post => ({ actor: 'kosui', channel: handsOn, text });
const textsOf = (posts: readonly Post[]): string[] => posts.map((post) => post.text);

describe('発言が属するチャンネル', () => {
  it('チャンネルを指定しない発言は、既定のチャンネルに属する', () => {
    expect(channelOfPost(support('a'), inquiryChannel)).toBe(inquiryChannel);
  });

  it('チャンネルを指定した発言は、そのチャンネルに属する', () => {
    expect(channelOfPost(presenter('a'), inquiryChannel)).toBe(handsOn);
  });

  it('再生の順に追うと、途中で切り替わり、元のチャンネルに戻る', () => {
    const timeline = [support('a'), presenter('b'), presenter('c'), support('d'), presenter('e')];
    expect(timeline.map((post) => channelOfPost(post, inquiryChannel))).toEqual([
      inquiryChannel,
      handsOn,
      handsOn,
      inquiryChannel,
      handsOn,
    ]);
  });
});

describe('チャンネルで表示する発言', () => {
  const history = [support('h1'), presenter('h2'), support('h3')];

  it('開いた直後は、履歴のうち既定のチャンネルの発言だけを表示する', () => {
    expect(textsOf(postsInChannel(history, inquiryChannel, inquiryChannel))).toEqual(['h1', 'h3']);
  });

  it('切り替えた先では、履歴と再生済みの発言のうち、そのチャンネルの発言だけを表示する', () => {
    const played = [presenter('t1')];
    expect(textsOf(postsInChannel([...history, ...played], handsOn, inquiryChannel))).toEqual(['h2', 't1']);
  });

  it('元のチャンネルに戻ると、非表示にしていた発言が元の順序で再び表示される', () => {
    const played = [presenter('t1'), support('t2')];
    const all = [...history, ...played];
    expect(textsOf(postsInChannel(all, handsOn, inquiryChannel))).toEqual(['h2', 't1']);
    expect(textsOf(postsInChannel(all, inquiryChannel, inquiryChannel))).toEqual(['h1', 'h3', 't2']);
  });

  it('どのチャンネルにも属さない発言がなければ、空になる', () => {
    expect(postsInChannel(history, '# dev', inquiryChannel)).toEqual([]);
  });
});

describe('ページを開いた時点のチャンネル', () => {
  const arriving = (post: Post, at = 0): TimelineEvent => ({ at, kind: 'post', post });
  const lead: Post = { actor: 'techlead', channel: '# dev', text: 'lead' };

  it('開いた時点で届く発言が無ければ、既定のチャンネルで開く', () => {
    expect(openingChannel([], inquiryChannel)).toBe(inquiryChannel);
  });

  it('開いた時点で届く最初の発言が別のチャンネルなら、そのチャンネルで開く', () => {
    expect(openingChannel([arriving(lead), arriving(support('a'), 2)], inquiryChannel)).toBe('# dev');
  });

  it('開いた時点で届く最初の発言がチャンネルを指定していなければ、既定のチャンネルで開く', () => {
    expect(openingChannel([arriving(support('a')), arriving(lead, 2)], inquiryChannel)).toBe(inquiryChannel);
  });

  it('合図を待つ発言と、発言以外の出来事は、開いた時点のチャンネルを決めない', () => {
    const waiting: TimelineEvent = { when: 'tests:ran', kind: 'post', post: lead };
    const affected: TimelineEvent = { at: 0, kind: 'affected', count: 1 };
    expect(openingChannel([waiting], inquiryChannel)).toBe(inquiryChannel);
    expect(openingChannel([waiting, affected, arriving(presenter('a'))], inquiryChannel)).toBe(handsOn);
  });

  it('開いてから時間が経って届く発言は、開いた時点のチャンネルを決めない', () => {
    expect(openingChannel([arriving(lead, 3)], inquiryChannel)).toBe(inquiryChannel);
    expect(openingChannel([arriving(lead, 3), arriving(presenter('a'))], inquiryChannel)).toBe(handsOn);
  });
});

describe('入力欄のプレースホルダ', () => {
  const placeholder = `${inquiryChannel} へのメッセージ`;

  it('既定のチャンネルでは、筋書きのプレースホルダのまま', () => {
    expect(placeholderOf(inquiryChannel, inquiryChannel, placeholder)).toBe(placeholder);
  });

  it('切り替えた先では、そのチャンネル名に置き換える', () => {
    expect(placeholderOf(handsOn, inquiryChannel, placeholder)).toBe(`${handsOn} へのメッセージ`);
  });
});

describe('開いた時点の発言の届く時刻', () => {
  const timesOf = (posts: readonly Post[]): number[] => openingSchedule(posts, inquiryChannel).map((item) => item.at);

  it('同じチャンネルが続く発言は、2 秒おきに届く', () => {
    expect(timesOf([support('a'), support('b'), support('c')])).toEqual([0, 2, 4]);
  });

  it('チャンネルが変わる発言は、3 秒と入力中表示の長さだけ空けて届く', () => {
    expect(timesOf([support('a'), presenter('b'), presenter('c'), support('d')])).toEqual([0, 4.5, 6.5, 11]);
  });

  it('最初の発言は、既定と別のチャンネルでも、待たずに届く', () => {
    expect(timesOf([presenter('a'), presenter('b')])).toEqual([0, 2]);
  });

  it('最初の発言の次からは、最初の発言のチャンネルを基準に間隔を空ける', () => {
    expect(timesOf([presenter('a'), support('b')])).toEqual([0, 4.5]);
  });

  it('切り替わる発言の入力中表示は、直前の発言の 3 秒後に始まり、1.5 秒続く', () => {
    const [first, second] = openingSchedule([support('a'), presenter('b')], inquiryChannel);
    if (first === undefined || second === undefined) throw new Error('発言がありません');
    expect(typingStartMs(second.at) - first.at * 1000).toBe(3000);
    expect(second.at * 1000 - typingStartMs(second.at)).toBe(typingLeadMs);
  });

  it('同じチャンネルの発言の入力中表示も、同じ長さである', () => {
    const [, second] = openingSchedule([support('a'), support('b')], inquiryChannel);
    if (second === undefined) throw new Error('発言がありません');
    expect(second.at * 1000 - typingStartMs(second.at)).toBe(typingLeadMs);
  });
});

describe('参加者が選んだチャンネルの状態', () => {
  const dev = '# dev';
  const general = '# general';
  const reading = (channel: string, unread: Record<string, number> = {}): ChannelState => ({
    channel,
    pinned: true,
    unread,
  });
  const arrive = (channel: string, self = false): { readonly channel: string; readonly self: boolean } => ({
    channel,
    self,
  });

  describe('チャンネルを選ぶ', () => {
    it('開いた時点では、開いた時点のチャンネルを表示し、固定せず、未読が無い', () => {
      expect(openingChannelState(dev)).toEqual({ channel: dev, pinned: false, unread: {} });
    });

    it('選んだチャンネルを表示し、固定する', () => {
      expect(selectChannel(openingChannelState(dev), inquiryChannel)).toMatchObject({
        channel: inquiryChannel,
        pinned: true,
      });
    });

    it('選んだチャンネルの未読を 0 にし、他のチャンネルの未読は残す', () => {
      const next = selectChannel(reading(inquiryChannel, { [dev]: 2, [handsOn]: 1 }), dev);
      expect(unreadOf(next, dev)).toBe(0);
      expect(unreadOf(next, handsOn)).toBe(1);
    });

    it('すでに表示しているチャンネルを選んでも、固定する', () => {
      expect(selectChannel(openingChannelState(dev), dev)).toMatchObject({ channel: dev, pinned: true });
    });
  });

  describe('発言が届く', () => {
    it('固定していないときは、発言のチャンネルに切り替える', () => {
      const next = receivePost(openingChannelState(dev), arrive(inquiryChannel));
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: false });
    });

    it('固定していないときに切り替えた先の、残っていた未読は 0 になる', () => {
      const state: ChannelState = { channel: dev, pinned: false, unread: { [inquiryChannel]: 3 } };
      expect(unreadOf(receivePost(state, arrive(inquiryChannel)), inquiryChannel)).toBe(0);
    });

    it('固定していて、別のチャンネルの発言が届いたときは、切り替えずに、そのチャンネルの未読を 1 増やす', () => {
      const next = receivePost(reading(inquiryChannel), arrive(dev));
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: true });
      expect(unreadOf(next, dev)).toBe(1);
      expect(unreadOf(receivePost(next, arrive(dev)), dev)).toBe(2);
    });

    it('固定していて、別のチャンネルの発言が届いたときは、表示中のチャンネルと他のチャンネルの未読を変えない', () => {
      const next = receivePost(reading(inquiryChannel, { [handsOn]: 4 }), arrive(dev));
      expect(unreadOf(next, inquiryChannel)).toBe(0);
      expect(unreadOf(next, handsOn)).toBe(4);
    });

    it('固定していて、表示中のチャンネルの発言が届いたときは、状態を変えない', () => {
      const state = reading(inquiryChannel, { [dev]: 1 });
      expect(receivePost(state, arrive(inquiryChannel))).toEqual(state);
    });

    it('参加者自身の発言が届いたときは、固定していても発言のチャンネルに切り替え、固定を解除する', () => {
      const next = receivePost(reading(dev), arrive(inquiryChannel, true));
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: false });
    });

    it('参加者自身の発言のあとに届く発言は、固定が解除されているので、発言のチャンネルに切り替わる', () => {
      const replied = receivePost(reading(dev), arrive(inquiryChannel, true));
      expect(receivePost(replied, arrive(handsOn))).toMatchObject({ channel: handsOn, pinned: false });
    });

    it('参加者自身の発言のチャンネルの未読は、0 になる', () => {
      const next = receivePost(reading(dev, { [inquiryChannel]: 2 }), arrive(inquiryChannel, true));
      expect(unreadOf(next, inquiryChannel)).toBe(0);
    });
  });

  describe('入力中の表示', () => {
    it('固定していないときは、発言のチャンネルに切り替えて、入力中を出す', () => {
      const next = receiveTyping(openingChannelState(dev), inquiryChannel);
      expect(next.channel).toBe(inquiryChannel);
      expect(typingVisible(next, inquiryChannel)).toBe(true);
    });

    it('固定していて、発言のチャンネルが表示中のチャンネルと同じときは、入力中を出す', () => {
      const state = reading(dev);
      expect(receiveTyping(state, dev)).toEqual(state);
      expect(typingVisible(state, dev)).toBe(true);
    });

    it('固定していて、発言のチャンネルが表示中のチャンネルと違うときは、切り替えず、入力中を出さない', () => {
      const state = reading(inquiryChannel);
      expect(receiveTyping(state, dev)).toEqual(state);
      expect(typingVisible(state, dev)).toBe(false);
    });

    it('固定していないときは、表示中のチャンネルと違っても、入力中を出す', () => {
      expect(typingVisible(openingChannelState(dev), inquiryChannel)).toBe(true);
    });
  });

  describe('最初からやり直す', () => {
    it('固定を解除し、チャンネルごとの未読を消し、開いた時点のチャンネルに戻す', () => {
      const dirty = reading(general, { [dev]: 2, [handsOn]: 1 });
      expect(dirty).not.toEqual(openingChannelState(dev));
      expect(openingChannelState(dev)).toEqual({ channel: dev, pinned: false, unread: {} });
    });
  });

  describe('未読の件数', () => {
    it('届いていないチャンネルの未読は 0 である', () => {
      expect(unreadOf(openingChannelState(dev), general)).toBe(0);
    });
  });
});
