import { describe, expect, it } from 'vitest';

import { insertMention, mentionListPlacement, mentionTokenAt } from './mentionSuggestion.ts';

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

describe('mentionListPlacement', () => {
  const base = { viewportTop: 0, viewportBottom: 800, preferredHeight: 256 };

  it('キャレットの下に収まるなら下に、希望の高さで開く', () => {
    expect(mentionListPlacement({ ...base, caretTop: 100, caretBottom: 120 })).toEqual({
      side: 'below',
      maxHeight: 256,
    });
  });

  it('スマホでキーボードに下を隠されていても、見えている範囲の中で下に開く', () => {
    // 入力欄は画面の下まで伸びているが、キーボードの上の 430px しか見えていない
    expect(mentionListPlacement({
      caretTop: 100,
      caretBottom: 120,
      viewportTop: 0,
      viewportBottom: 430,
      preferredHeight: 256,
    })).toEqual({ side: 'below', maxHeight: 256 });
  });

  it('下が狭く上が広ければ上に開き、上の余白に収まる高さにする', () => {
    expect(mentionListPlacement({ ...base, caretTop: 700, caretBottom: 720, viewportBottom: 760 })).toEqual({
      side: 'above',
      maxHeight: 256,
    });
    expect(mentionListPlacement({ ...base, caretTop: 150, caretBottom: 170, viewportBottom: 200 })).toEqual({
      side: 'above',
      maxHeight: 142,
    });
  });

  it('下も上も狭いときは広い側に開き、見えている範囲に合わせて縮める', () => {
    expect(mentionListPlacement({ ...base, caretTop: 90, caretBottom: 110, viewportBottom: 220 })).toEqual({
      side: 'below',
      maxHeight: 102,
    });
  });
});
