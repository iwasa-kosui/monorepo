import { describe, expect, it } from 'vitest';

import { containsKana } from '../isJapanese.ts';

describe('containsKana', () => {
  it.each([
    ['こんにちは', true],
    ['カタカナ', true],
    ['Hello こ', true],
    ['ー', true],
    ['漢字', false],
    ['日本語 中文', false],
    ['Hello, world', false],
    ['', false],
  ])('%s は %s', (text, expected) => {
    expect(containsKana(text)).toBe(expected);
  });
});
