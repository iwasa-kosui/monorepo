import { describe, expect, it } from 'vitest';

import {
  BLUESKY_REPLY_MAX_GRAPHEMES,
  blueskyReplyErrorMessage,
  blueskyReplyExcerpt,
  blueskyReplyRemaining,
  canSendBlueskyReply,
  countGraphemes,
} from './blueskyReply.ts';

const apiError = (status: number): Error => Object.assign(new Error('x'), { status });

describe('countGraphemes', () => {
  it('絵文字の連結や結合文字を 1 つに数える', () => {
    expect(countGraphemes('abc')).toBe(3);
    expect(countGraphemes('👨‍👩‍👧‍👦')).toBe(1);
    expect(countGraphemes('é')).toBe(1);
    expect(countGraphemes('こんにちは')).toBe(5);
  });
});

describe('blueskyReplyRemaining', () => {
  it('300 grapheme からの残りを返し、超えると負になる', () => {
    expect(blueskyReplyRemaining('')).toBe(BLUESKY_REPLY_MAX_GRAPHEMES);
    expect(blueskyReplyRemaining('a'.repeat(300))).toBe(0);
    expect(blueskyReplyRemaining('a'.repeat(301))).toBe(-1);
  });
});

describe('canSendBlueskyReply', () => {
  it('空白だけのときと送信中は送れない', () => {
    expect(canSendBlueskyReply('', false)).toBe(false);
    expect(canSendBlueskyReply(' \n', false)).toBe(false);
    expect(canSendBlueskyReply('こんにちは', true)).toBe(false);
  });

  it('300 grapheme ちょうどまで送れ、超えたら送れない', () => {
    expect(canSendBlueskyReply('a'.repeat(300), false)).toBe(true);
    expect(canSendBlueskyReply('a'.repeat(301), false)).toBe(false);
  });
});

describe('blueskyReplyExcerpt', () => {
  it('短い本文はそのまま返し、長い本文は 80 grapheme で切って省略記号を付ける', () => {
    expect(blueskyReplyExcerpt('短い')).toBe('短い');
    expect(blueskyReplyExcerpt('a'.repeat(80))).toBe('a'.repeat(80));
    expect(blueskyReplyExcerpt('a'.repeat(81))).toBe(`${'a'.repeat(80)}…`);
  });
});

describe('blueskyReplyErrorMessage', () => {
  it('404、409、それ以外でステータスに応じた文言を返す', () => {
    expect(blueskyReplyErrorMessage(apiError(404))).toBe('返信先の投稿が見つかりません');
    expect(blueskyReplyErrorMessage(apiError(409))).toBe('Bluesky のタイムラインが無効です');
    expect(blueskyReplyErrorMessage(apiError(400))).toBe('Bluesky に返信できませんでした');
    expect(blueskyReplyErrorMessage(new TypeError('network'))).toBe('Bluesky に返信できませんでした');
  });
});
