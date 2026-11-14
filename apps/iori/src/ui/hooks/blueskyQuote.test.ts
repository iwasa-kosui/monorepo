import { describe, expect, it } from 'vitest';

import { blueskyQuoteErrorMessage } from './blueskyQuote.ts';

describe('blueskyQuoteErrorMessage の画像のエラー', () => {
  it('422 で code が media_invalid のときはサーバーの文言を返す', () => {
    const error = Object.assign(new Error('Bluesky に送れる画像は 4 枚までです'), {
      status: 422,
      code: 'media_invalid',
    });
    expect(blueskyQuoteErrorMessage(error)).toBe('Bluesky に送れる画像は 4 枚までです');
  });

  it('code がない 422 は従来の文言のままにする', () => {
    const error = Object.assign(new Error('Quote not allowed'), { status: 422 });
    expect(blueskyQuoteErrorMessage(error)).toBe('この投稿は引用できません');
  });
});
