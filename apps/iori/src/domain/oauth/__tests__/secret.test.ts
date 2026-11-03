import { describe, expect, it } from 'vitest';

import { CodeChallenge } from '../pkce.ts';
import { Secret } from '../secret.ts';

describe('Secret', () => {
  it('32 バイトの乱数を base64url にして返す', () => {
    const secret = Secret.generate();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Secret.generate()).not.toBe(secret);
  });

  it('SHA-256 の hex を返す', async () => {
    await expect(Secret.hash('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

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
