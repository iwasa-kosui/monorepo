import { describe, expect, it } from 'vitest';

import { CodeChallenge } from '../pkce.ts';
import { Secret } from '../secret.ts';

describe('Secret', () => {
  it('同じ値だけを一致と判定する', async () => {
    const hash = await Secret.hash('secret');
    await expect(Secret.matches('secret', hash)).resolves.toBe(true);
    await expect(Secret.matches('secret2', hash)).resolves.toBe(false);
    expect(Secret.timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('CodeChallenge', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

  it('RFC 7636 の例で S256 を検証する', async () => {
    await expect(CodeChallenge.verify(CodeChallenge.orThrow(challenge), verifier)).resolves.toBe(true);
    await expect(CodeChallenge.verify(CodeChallenge.orThrow(challenge), `${verifier}x`)).resolves.toBe(false);
    await expect(CodeChallenge.verify(CodeChallenge.orThrow(challenge), 'short')).resolves.toBe(false);
  });
});
