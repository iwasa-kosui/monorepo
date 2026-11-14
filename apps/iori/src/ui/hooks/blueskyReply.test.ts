import { describe, expect, it } from 'vitest';

import {
  BLUESKY_REPLY_MAX_GRAPHEMES,
  blueskyReplyErrorMessage,
  blueskyReplyExcerpt,
  blueskyReplyRemaining,
  canSendBlueskyPost,
  canSendBlueskyReply,
  countGraphemes,
} from './blueskyReply.ts';

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

  it('前後の空白を除いた本文で数え、空白つきの 300 grapheme は送れる', () => {
    expect(blueskyReplyRemaining(`  ${'a'.repeat(300)} \n`)).toBe(0);
    expect(canSendBlueskyReply(`  ${'a'.repeat(300)} \n`, false)).toBe(true);
    expect(canSendBlueskyReply(` ${'a'.repeat(301)} `, false)).toBe(false);
  });
});

describe('canSendBlueskyPost', () => {
  const idle = { isSending: false, isUploading: false };

  it('本文が空でも画像があれば送れる', () => {
    expect(canSendBlueskyPost('', 0, idle)).toBe(false);
    expect(canSendBlueskyPost(' \n', 0, idle)).toBe(false);
    expect(canSendBlueskyPost('', 1, idle)).toBe(true);
    expect(canSendBlueskyPost('こんにちは', 0, idle)).toBe(true);
  });

  it('送信中とアップロード中は送れない', () => {
    expect(canSendBlueskyPost('a', 1, { isSending: true, isUploading: false })).toBe(false);
    expect(canSendBlueskyPost('a', 1, { isSending: false, isUploading: true })).toBe(false);
  });

  it('画像があっても 300 grapheme を超える本文は送れない', () => {
    expect(canSendBlueskyPost('a'.repeat(301), 1, idle)).toBe(false);
  });
});

describe('blueskyReplyExcerpt', () => {
  it('短い本文はそのまま返し、長い本文は 80 grapheme で切って省略記号を付ける', () => {
    expect(blueskyReplyExcerpt('短い')).toBe('短い');
    expect(blueskyReplyExcerpt('a'.repeat(80))).toBe('a'.repeat(80));
    expect(blueskyReplyExcerpt('a'.repeat(81))).toBe(`${'a'.repeat(80)}…`);
  });
});

describe('blueskyReplyErrorMessage の画像のエラー', () => {
  it('422 で code が media_invalid のときはサーバーの文言を返す', () => {
    const error = Object.assign(new Error('Bluesky に送れる画像は 4 枚までです'), {
      status: 422,
      code: 'media_invalid',
    });
    expect(blueskyReplyErrorMessage(error)).toBe('Bluesky に送れる画像は 4 枚までです');
  });

  it('code がない 422 は従来の文言のままにする', () => {
    const error = Object.assign(new Error('Reply not allowed'), { status: 422 });
    expect(blueskyReplyErrorMessage(error)).toBe('この投稿には返信できません');
  });
});
