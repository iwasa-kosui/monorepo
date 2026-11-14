import { describe, expect, it } from 'vitest';

import { EMOJI_IMAGE_URL_MAX_LENGTH, toAcceptableEmojiImageUrl } from '../emojiImageUrl.ts';

const httpsUrlOfLength = (length: number): string => {
  const prefix = 'https://example.com/';
  return `${prefix}${'a'.repeat(length - prefix.length)}`;
};

describe('toAcceptableEmojiImageUrl', () => {
  it('https の URL はそのまま返す', () => {
    const url = 'https://example.com/emoji/blobcat.png';
    expect(toAcceptableEmojiImageUrl(url)).toBe(url);
  });

  it('http の URL は null を返す', () => {
    expect(toAcceptableEmojiImageUrl('http://example.com/emoji/blobcat.png')).toBeNull();
  });

  it('javascript: の URL は null を返す', () => {
    expect(toAcceptableEmojiImageUrl('javascript:alert(1)')).toBeNull();
  });

  it('URL として解釈できない文字列は null を返す', () => {
    expect(toAcceptableEmojiImageUrl('not a url')).toBeNull();
  });

  it('ちょうど上限の長さの https の URL はそのまま返す', () => {
    const url = httpsUrlOfLength(EMOJI_IMAGE_URL_MAX_LENGTH);
    expect(url.length).toBe(2048);
    expect(toAcceptableEmojiImageUrl(url)).toBe(url);
  });

  it('上限を 1 文字超える URL は null を返す', () => {
    const url = httpsUrlOfLength(EMOJI_IMAGE_URL_MAX_LENGTH + 1);
    expect(url.length).toBe(2049);
    expect(toAcceptableEmojiImageUrl(url)).toBeNull();
  });
});
