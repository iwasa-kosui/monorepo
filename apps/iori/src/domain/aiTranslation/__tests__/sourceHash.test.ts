import { describe, expect, it } from 'vitest';

import { hashTranslationSource } from '../sourceHash.ts';

describe('hashTranslationSource', () => {
  it('SHA-256 を 16 進で返す', async () => {
    expect(await hashTranslationSource('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('原文が違えば別の値を返す', async () => {
    expect(await hashTranslationSource('<p>a</p>')).not.toBe(await hashTranslationSource('<p>b</p>'));
  });
});
