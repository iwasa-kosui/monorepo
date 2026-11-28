import { describe, expect, it } from 'vitest';

import { isLiveId, liveLimits, normalizeName, normalizeText, parsePostFrame, parseServerFrame } from './live-protocol';

const id = 'a1b2c3d4-0000-4000-8000-000000000000';

describe('名前と本文を整える', () => {
  it('名前は、前後の空白を除き、改行と連続する空白を1つの空白にする', () => {
    expect(normalizeName('  眠い\n柴犬   1号 ')).toBe('眠い 柴犬 1号');
  });

  it('名前は、上限の文字数で切る', () => {
    expect([...normalizeName('あ'.repeat(liveLimits.nameChars + 5))]).toHaveLength(liveLimits.nameChars);
  });

  it('名前は、絵文字を文字の途中で切らない', () => {
    expect(normalizeName('🐶'.repeat(liveLimits.nameChars + 1))).toBe('🐶'.repeat(liveLimits.nameChars));
  });

  it('名前から、制御文字と見えない文字を除く', () => {
    expect(normalizeName('ko​sui‮')).toBe('ko sui');
  });

  it('本文は、改行を残し、3行以上続く空行を1行の空行にする', () => {
    expect(normalizeText('1行目\r\n2行目\n\n\n\n3行目')).toBe('1行目\n2行目\n\n3行目');
  });

  it('本文は、上限の文字数で切り、空白だけなら空文字にする', () => {
    expect([...normalizeText('あ'.repeat(liveLimits.textChars + 1))]).toHaveLength(liveLimits.textChars);
    expect(normalizeText(' \n\t ')).toBe('');
  });
});

describe('送信者と投稿の id', () => {
  it('英数字とハイフンの 8〜64 文字だけを受け付ける', () => {
    expect(isLiveId(id)).toBe(true);
    expect(isLiveId('short')).toBe(false);
    expect(isLiveId('a'.repeat(65))).toBe(false);
    expect(isLiveId('abcdefgh<script>')).toBe(false);
    expect(isLiveId(null)).toBe(false);
  });
});

describe('クライアントから届く投稿を読む', () => {
  it('名前と本文を整えた投稿を返す', () => {
    expect(parsePostFrame(JSON.stringify({ type: 'post', id, name: ' 柴犬 ', text: ' こんにちは\n' }))).toEqual({
      type: 'post',
      id,
      name: '柴犬',
      text: 'こんにちは',
    });
  });

  it.each([
    ['JSON でない', 'x'],
    ['type が違う', JSON.stringify({ type: 'other', id, name: 'a', text: 'b' })],
    ['id が不正', JSON.stringify({ type: 'post', id: 'x', name: 'a', text: 'b' })],
    ['名前が空', JSON.stringify({ type: 'post', id, name: '  ', text: 'b' })],
    ['本文が空', JSON.stringify({ type: 'post', id, name: 'a', text: ' \n ' })],
    ['本文が文字列でない', JSON.stringify({ type: 'post', id, name: 'a', text: 1 })],
    ['長すぎる', JSON.stringify({ type: 'post', id, name: 'a', text: 'あ'.repeat(liveLimits.frameChars) })],
  ])('%s投稿は読まない', (_, raw) => {
    expect(parsePostFrame(raw)).toBeNull();
  });
});

describe('サーバーから届くフレームを読む', () => {
  const message = { id, author: 'abc123', name: '柴犬', text: 'こんにちは', at: 1 };

  it('hello は、自分の author と、読めた投稿だけを返す', () => {
    expect(parseServerFrame(JSON.stringify({ type: 'hello', author: 'abc123', messages: [message, { id: 1 }] })))
      .toEqual({ type: 'hello', author: 'abc123', messages: [message] });
  });

  it('message、rejected、cleared を読む', () => {
    expect(parseServerFrame(JSON.stringify({ type: 'message', message }))).toEqual({ type: 'message', message });
    expect(parseServerFrame(JSON.stringify({ type: 'rejected', id, reason: 'rate' }))).toEqual({
      type: 'rejected',
      id,
      reason: 'rate',
    });
    expect(parseServerFrame(JSON.stringify({ type: 'cleared' }))).toEqual({ type: 'cleared' });
  });

  it('知らない形のフレームは読まない', () => {
    expect(parseServerFrame('pong')).toBeNull();
    expect(parseServerFrame(JSON.stringify({ type: 'message', message: { id } }))).toBeNull();
    expect(parseServerFrame(JSON.stringify({ type: 'rejected', id, reason: 'other' }))).toBeNull();
  });
});
