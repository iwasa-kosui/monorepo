import { describe, expect, it } from 'vitest';

import { channelOfPost, openingSchedule, placeholderOf, postsInChannel, typingLeadMs, typingStartMs } from './channel';
import type { Post } from './scenario';

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

  it('最初の発言が既定と別のチャンネルなら、履歴を読む時間を空けて届く', () => {
    expect(timesOf([presenter('a'), presenter('b')])).toEqual([4.5, 6.5]);
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
