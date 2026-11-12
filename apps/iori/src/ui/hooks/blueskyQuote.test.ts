import { describe, expect, it } from 'vitest';

import { blueskyQuoteErrorMessage } from './blueskyQuote.ts';

const apiError = (status: number): Error => Object.assign(new Error('x'), { status });

describe('blueskyQuoteErrorMessage', () => {
  it('404、409、422、それ以外でステータスに応じた文言を返す', () => {
    expect(blueskyQuoteErrorMessage(apiError(404))).toBe('引用する投稿が見つかりません');
    expect(blueskyQuoteErrorMessage(apiError(409))).toBe('Bluesky のタイムラインが無効です');
    expect(blueskyQuoteErrorMessage(apiError(422))).toBe('この投稿は引用できません');
    expect(blueskyQuoteErrorMessage(apiError(400))).toBe('Bluesky に引用できませんでした');
    expect(blueskyQuoteErrorMessage(new TypeError('network'))).toBe('Bluesky に引用できませんでした');
  });
});
