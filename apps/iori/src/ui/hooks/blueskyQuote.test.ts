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
});
