import { describe, expect, it } from 'vitest';

import { canSendQuote } from './quoteDialog.ts';

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
