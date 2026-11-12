import { describe, expect, it } from 'vitest';

import { canSendQuote, quoteErrorMessage } from './quoteDialog.ts';

const apiError = (status: number): Error => Object.assign(new Error('x'), { status });

describe('canSendQuote', () => {
  it('空白だけのときと送信中は送れない', () => {
    expect(canSendQuote('', false)).toBe(false);
    expect(canSendQuote(' \n', false)).toBe(false);
    expect(canSendQuote('コメント', true)).toBe(false);
  });

  it('本文があれば送れる', () => {
    expect(canSendQuote('コメント', false)).toBe(true);
  });
});

describe('quoteErrorMessage', () => {
  it('404 は引用する投稿が見つからないと伝える', () => {
    expect(quoteErrorMessage(apiError(404))).toBe('引用する投稿が見つかりません');
  });

  it('422 は引用できない投稿と伝える', () => {
    expect(quoteErrorMessage(apiError(422))).toBe('この投稿は引用できません');
  });

  it('それ以外の API エラーとネットワークエラーは引用できなかったと伝える', () => {
    expect(quoteErrorMessage(apiError(500))).toBe('引用できませんでした');
    expect(quoteErrorMessage(new TypeError('Failed to fetch'))).toBe('引用できませんでした');
  });
});
