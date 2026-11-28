import { describe, expect, it } from 'vitest';

import {
  channelOfPost,
  type ChannelState,
  dayDividers,
  dayOfPost,
  hasOpeningPost,
  openingChannel,
  openingChannelState,
  openingSchedule,
  placeholderOf,
  postsInChannel,
  receiveAmbient,
  receivePost,
  receiveTyping,
  revealChannel,
  selectChannel,
  todayLabel,
  totalUnread,
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
  const colleague: Post = { actor: 'colleague', channel: '# dev', text: 'colleague' };

  it('開いた時点で届く発言が無ければ、既定のチャンネルで開く', () => {
    expect(openingChannel([], inquiryChannel)).toBe(inquiryChannel);
  });

  it('開いた時点で届く最初の発言が別のチャンネルなら、そのチャンネルで開く', () => {
    expect(openingChannel([arriving(colleague), arriving(support('a'), 2)], inquiryChannel)).toBe('# dev');
  });

  it('開いた時点で届く最初の発言がチャンネルを指定していなければ、既定のチャンネルで開く', () => {
    expect(openingChannel([arriving(support('a')), arriving(colleague, 2)], inquiryChannel)).toBe(inquiryChannel);
  });

  it('合図を待つ発言と、発言以外の出来事は、開いた時点のチャンネルを決めない', () => {
    const waiting: TimelineEvent = { when: 'tests:ran', kind: 'post', post: colleague };
    const affected: TimelineEvent = { at: 0, kind: 'affected', count: 1 };
    expect(openingChannel([waiting], inquiryChannel)).toBe(inquiryChannel);
    expect(openingChannel([waiting, affected, arriving(presenter('a'))], inquiryChannel)).toBe(handsOn);
  });

  it('開いてから時間が経って届く発言は、開いた時点のチャンネルを決めない', () => {
    expect(openingChannel([arriving(colleague, 3)], inquiryChannel)).toBe(inquiryChannel);
    expect(openingChannel([arriving(colleague, 3), arriving(presenter('a'))], inquiryChannel)).toBe(handsOn);
  });

  it('開いた時点で届く発言があるかを答える', () => {
    const waiting: TimelineEvent = { when: 'tests:ran', kind: 'post', post: colleague };
    expect(hasOpeningPost([arriving(support('a'))])).toBe(true);
    expect(hasOpeningPost([arriving(colleague, 3), waiting])).toBe(false);
    expect(hasOpeningPost([])).toBe(false);
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
      const next = receivePost(openingChannelState(dev), arrive(inquiryChannel), true);
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: false });
    });

    it('固定していないときに切り替えた先の、残っていた未読は 0 になる', () => {
      const state: ChannelState = { channel: dev, pinned: false, unread: { [inquiryChannel]: 3 } };
      expect(unreadOf(receivePost(state, arrive(inquiryChannel), true), inquiryChannel)).toBe(0);
    });

    it('固定していて、別のチャンネルの発言が届いたときは、切り替えずに、そのチャンネルの未読を 1 増やす', () => {
      const next = receivePost(reading(inquiryChannel), arrive(dev), true);
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: true });
      expect(unreadOf(next, dev)).toBe(1);
      expect(unreadOf(receivePost(next, arrive(dev), true), dev)).toBe(2);
    });

    it('固定していて、別のチャンネルの発言が届いたときは、表示中のチャンネルと他のチャンネルの未読を変えない', () => {
      const next = receivePost(reading(inquiryChannel, { [handsOn]: 4 }), arrive(dev), true);
      expect(unreadOf(next, inquiryChannel)).toBe(0);
      expect(unreadOf(next, handsOn)).toBe(4);
    });

    it('固定していて、表示中のチャンネルの発言が届いたときは、状態を変えない', () => {
      const state = reading(inquiryChannel, { [dev]: 1 });
      expect(receivePost(state, arrive(inquiryChannel), true)).toEqual(state);
    });

    it('参加者自身の発言が届いたときは、固定していても発言のチャンネルに切り替え、固定を解除する', () => {
      const next = receivePost(reading(dev), arrive(inquiryChannel, true), true);
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: false });
    });

    it('固定していないときの参加者自身の発言は、発言のチャンネルに切り替え、固定しないままにする', () => {
      const next = receivePost(openingChannelState(dev), arrive(inquiryChannel, true), true);
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: false });
    });

    it('参加者自身の発言のあとに届く発言は、固定が解除されているので、発言のチャンネルに切り替わる', () => {
      const replied = receivePost(reading(dev), arrive(inquiryChannel, true), true);
      expect(receivePost(replied, arrive(handsOn), true)).toMatchObject({ channel: handsOn, pinned: false });
    });

    it('参加者自身の発言のチャンネルの未読は、0 になる', () => {
      const next = receivePost(reading(dev, { [inquiryChannel]: 2 }), arrive(inquiryChannel, true), true);
      expect(unreadOf(next, inquiryChannel)).toBe(0);
    });
  });

  describe('ほかの参加者のメッセージが届く', () => {
    it('表示中のチャンネルに届いたときは、状態を変えない', () => {
      const state = reading(handsOn, { [dev]: 1 });
      expect(receiveAmbient(state, handsOn, true)).toEqual(state);
    });

    it('固定していなくても、表示中のチャンネルを切り替えずに、届いたチャンネルの未読を 1 増やす', () => {
      const next = receiveAmbient(openingChannelState(inquiryChannel), handsOn, true);
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: false });
      expect(unreadOf(next, handsOn)).toBe(1);
      expect(unreadOf(receiveAmbient(next, handsOn, true), handsOn)).toBe(2);
    });

    it('チャットが見えていない間は、表示中のチャンネルに届いても、未読を 1 増やす', () => {
      const next = receiveAmbient(reading(handsOn), handsOn, false);
      expect(next).toMatchObject({ channel: handsOn, pinned: true });
      expect(unreadOf(next, handsOn)).toBe(1);
    });
  });

  describe('チャットが見えていない間に発言が届く', () => {
    it('固定していなくても、離れたチャンネルの発言の未読が残り、表示中のチャンネルは最後の発言のチャンネルになる', () => {
      const posts = [arrive(dev), arrive(handsOn), arrive(handsOn)];
      const hidden = posts.reduce((state, post) => receivePost(state, post, false), openingChannelState(handsOn));
      expect(hidden.channel).toBe(handsOn);
      expect(unreadOf(hidden, dev)).toBe(1);
      expect(unreadOf(hidden, handsOn)).toBe(2);
    });

    it('見えるようになると、表示中のチャンネルの未読だけが 0 になり、離れたチャンネルの未読は残る', () => {
      const posts = [arrive(dev), arrive(handsOn), arrive(handsOn)];
      const hidden = posts.reduce((state, post) => receivePost(state, post, false), openingChannelState(handsOn));
      const shown = revealChannel(hidden);
      expect(shown.channel).toBe(handsOn);
      expect(unreadOf(shown, handsOn)).toBe(0);
      expect(unreadOf(shown, dev)).toBe(1);
    });

    it('固定していても、別のチャンネルの発言の未読が増え、表示中のチャンネルは変わらない', () => {
      const next = receivePost(reading(inquiryChannel), arrive(dev), false);
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: true });
      expect(unreadOf(next, dev)).toBe(1);
    });

    it('参加者自身の発言は、未読を増やさず、宛先のチャンネルを表示して固定を解除する', () => {
      const next = receivePost(reading(dev), arrive(inquiryChannel, true), false);
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: false });
      expect(unreadOf(next, inquiryChannel)).toBe(0);
    });

    it('固定していないときに切り替えた先の、残っていた未読は 0 にならず、1 増える', () => {
      const state: ChannelState = { channel: dev, pinned: false, unread: { [inquiryChannel]: 3 } };
      expect(unreadOf(receivePost(state, arrive(inquiryChannel), false), inquiryChannel)).toBe(4);
    });
  });

  describe('チャットが見えるようになる', () => {
    it('固定したチャンネルの未読を 0 にし、固定は変えない', () => {
      const next = revealChannel(reading(inquiryChannel, { [inquiryChannel]: 2, [dev]: 1 }));
      expect(next).toMatchObject({ channel: inquiryChannel, pinned: true });
      expect(unreadOf(next, inquiryChannel)).toBe(0);
      expect(unreadOf(next, dev)).toBe(1);
    });
  });

  describe('入力中の表示', () => {
    it('固定していないときは、発言のチャンネルに切り替えて、入力中を出す', () => {
      const next = receiveTyping(openingChannelState(dev), inquiryChannel, true);
      expect(next.channel).toBe(inquiryChannel);
      expect(typingVisible(next, inquiryChannel)).toBe(true);
    });

    it('固定していないときに切り替えた先の、残っていた未読は 0 になる', () => {
      const state: ChannelState = { channel: dev, pinned: false, unread: { [inquiryChannel]: 3 } };
      expect(unreadOf(receiveTyping(state, inquiryChannel, true), inquiryChannel)).toBe(0);
    });

    it('チャットが見えていない間は、切り替えても、切り替えた先の未読を 0 にしない', () => {
      const state: ChannelState = { channel: dev, pinned: false, unread: { [inquiryChannel]: 3 } };
      const next = receiveTyping(state, inquiryChannel, false);
      expect(next.channel).toBe(inquiryChannel);
      expect(unreadOf(next, inquiryChannel)).toBe(3);
    });

    it('固定していて、発言のチャンネルが表示中のチャンネルと同じときは、入力中を出す', () => {
      const state = reading(dev);
      expect(receiveTyping(state, dev, true)).toEqual(state);
      expect(typingVisible(state, dev)).toBe(true);
    });

    it('固定していて、発言のチャンネルが表示中のチャンネルと違うときは、切り替えず、入力中を出さない', () => {
      const state = reading(inquiryChannel);
      expect(receiveTyping(state, dev, true)).toEqual(state);
      expect(typingVisible(state, dev)).toBe(false);
    });

    it('固定していないときは、表示中のチャンネルと違っても、入力中を出す', () => {
      expect(typingVisible(openingChannelState(dev), inquiryChannel)).toBe(true);
    });
  });

  describe('未読の件数', () => {
    it('届いていないチャンネルの未読は 0 である', () => {
      expect(unreadOf(openingChannelState(dev), general)).toBe(0);
    });

    it('チャット全体の未読は、チャンネルごとの未読の合計である', () => {
      expect(totalUnread(reading(dev, { [dev]: 2, [handsOn]: 1, [general]: 4 }))).toBe(7);
    });

    it('どのチャンネルにも未読が無いときの、チャット全体の未読は 0 である', () => {
      expect(totalUnread(openingChannelState(dev))).toBe(0);
    });

    it('チャットが見えるようになると、表示中のチャンネルの分だけ合計から減る', () => {
      const next = revealChannel(reading(dev, { [dev]: 1, [handsOn]: 3 }));
      expect(totalUnread(next)).toBe(3);
    });

    it('チャットが見えていて別のチャンネルに届いた発言も、合計に入る', () => {
      const next = receivePost(reading(dev), arrive(handsOn), true);
      expect(totalUnread(next)).toBe(1);
    });

    it('チャンネルを選ぶと、選んだチャンネルの分だけ合計から減る', () => {
      const next = selectChannel(reading(dev, { [dev]: 1, [handsOn]: 3 }), handsOn);
      expect(totalUnread(next)).toBe(1);
    });
  });
});

describe('日付の区切り', () => {
  const friday = '11月6日（金）';
  const old = (text: string): Post => ({ actor: 'support', text, day: friday });

  it('日付を持たない発言は、今日の発言である', () => {
    expect(todayLabel).toBe('今日');
    expect(dayOfPost(support('a'))).toBe('今日');
    expect(dayOfPost(old('a'))).toBe(friday);
  });

  it('今日の発言だけのときは、区切りを入れない', () => {
    expect(dayDividers([support('a'), support('b')])).toEqual([null, null]);
    expect(dayDividers([])).toEqual([]);
  });

  it('過去の日の発言で始まるときは、最初の発言の前にその日の区切りを入れる', () => {
    expect(dayDividers([old('a'), old('b')])).toEqual([friday, null]);
  });

  it('日付が変わる発言の前に、その日の区切りを入れる', () => {
    expect(dayDividers([old('a'), old('b'), support('c'), support('d')])).toEqual([friday, null, '今日', null]);
  });
});
