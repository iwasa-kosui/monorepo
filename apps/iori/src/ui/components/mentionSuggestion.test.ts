import { describe, expect, it } from 'vitest';

import { insertMention, mentionTokenAt } from './mentionSuggestion.ts';

describe('mentionTokenAt', () => {
  it('行頭や空白の後の @ から、キャレットまでを書きかけのメンションとして返す', () => {
    expect(mentionTokenAt('@ali', 4)).toEqual({ start: 0, end: 4, query: 'ali' });
    expect(mentionTokenAt('こんにちは @alice@mas', 16)).toEqual({ start: 6, end: 16, query: 'alice@mas' });
  });

  it('全角文字の直後の @ もメンションとして扱う', () => {
    expect(mentionTokenAt('どうも@bob', 7)).toEqual({ start: 3, end: 7, query: 'bob' });
  });

  it('メールアドレスや @ だけ、キャレットより前で終わったメンションには候補を出さない', () => {
    expect(mentionTokenAt('me@example', 10)).toBeUndefined();
    expect(mentionTokenAt('@', 1)).toBeUndefined();
    expect(mentionTokenAt('@alice さん', 9)).toBeUndefined();
  });

  it('キャレットより後ろの文字は見ない', () => {
    expect(mentionTokenAt('@alice', 3)).toEqual({ start: 0, end: 3, query: 'al' });
  });
});

describe('insertMention', () => {
  it('書きかけのメンションを置き換え、空白を足してキャレットをその後ろに置く', () => {
    const token = { start: 4, end: 8, query: 'ali' };
    expect(insertMention('hey @ali', token, 'alice@remote.example')).toEqual({
      text: 'hey @alice@remote.example ',
      caret: 26,
    });
  });

  it('後ろが空白で始まるときは空白を重ねない', () => {
    const token = { start: 0, end: 3, query: 'al' };
    expect(insertMention('@al there', token, 'alice@r.example')).toEqual({
      text: '@alice@r.example there',
      caret: 16,
    });
  });
});
