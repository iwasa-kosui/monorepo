import { describe, expect, it } from 'vitest';

import { hashTranslationSource } from '../sourceHash.ts';

describe('hashTranslationSource', () => {
  it('SHA-256 を 16 進で返す', async () => {
    expect(await hashTranslationSource('abc')).toBe(
      '612b8a6b912e2fc6a667f07b7561c307f6ea16bafa7b13322706f64640c91489',
    );
  });

  it('原文が違えば別の値を返す', async () => {
    expect(await hashTranslationSource('<p>a</p>')).not.toBe(await hashTranslationSource('<p>b</p>'));
  });
});
