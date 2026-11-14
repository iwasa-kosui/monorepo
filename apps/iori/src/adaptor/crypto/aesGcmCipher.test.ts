import { describe, expect, it } from 'vitest';

import { blueskyCredentialAad } from '../../domain/blueskyCredential/blueskyCredential.ts';
import { createAesGcmCipher, createAesGcmCipherFactory, decodeAesGcmKey } from './aesGcmCipher.ts';

const keyOf = (fill: number, length = 32): string => btoa(String.fromCharCode(...new Uint8Array(length).fill(fill)));
const KEY = keyOf(7);
const AAD = blueskyCredentialAad('did:plc:alice');

describe('decodeAesGcmKey', () => {
  it('32 バイトの base64 だけを鍵として受け取る', () => {
    expect(decodeAesGcmKey(KEY)?.length).toBe(32);
    expect(decodeAesGcmKey(` ${KEY}\n`)?.length).toBe(32);
    expect(decodeAesGcmKey(undefined)).toBeUndefined();
    expect(decodeAesGcmKey('')).toBeUndefined();
    expect(decodeAesGcmKey('%%%not base64%%%')).toBeUndefined();
    expect(decodeAesGcmKey(keyOf(7, 31))).toBeUndefined();
    expect(decodeAesGcmKey(keyOf(7, 33))).toBeUndefined();
  });
});

describe('createAesGcmCipher', () => {
  it('不正な鍵では cipher を作らない', () => {
    expect(createAesGcmCipher({ key: undefined, aad: AAD })).toBeUndefined();
    expect(createAesGcmCipher({ key: 'short', aad: AAD })).toBeUndefined();
  });

  it('暗号化した値を、同じ鍵と AAD で復号できる', async () => {
    const cipher = createAesGcmCipher({ key: KEY, aad: AAD })!;

    const secret = await cipher.encrypt('abcd-efgh-ijkl-mnop');

    expect(secret.ciphertext).not.toContain('abcd');
    expect(atob(secret.iv)).toHaveLength(12);
    expect(await cipher.decrypt(secret)).toBe('abcd-efgh-ijkl-mnop');
  });

  it('暗号化のたびに別の IV を使う', async () => {
    const cipher = createAesGcmCipher({ key: KEY, aad: AAD })!;

    const first = await cipher.encrypt('same');
    const second = await cipher.encrypt('same');

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('鍵が違うと復号できない', async () => {
    const secret = await createAesGcmCipher({ key: KEY, aad: AAD })!.encrypt('secret');

    expect(await createAesGcmCipher({ key: keyOf(8), aad: AAD })!.decrypt(secret)).toBeUndefined();
  });

  it('AAD が違うと復号できない', async () => {
    const secret = await createAesGcmCipher({ key: KEY, aad: AAD })!.encrypt('secret');

    expect(await createAesGcmCipher({ key: KEY, aad: 'bluesky_credentials:other:v1' })!.decrypt(secret))
      .toBeUndefined();
  });

  it('暗号文の改ざんと不正な base64 は例外にせず undefined を返す', async () => {
    const cipher = createAesGcmCipher({ key: KEY, aad: AAD })!;
    const secret = await cipher.encrypt('secret');
    const tampered = atob(secret.ciphertext).split('');
    tampered[0] = String.fromCharCode(tampered[0]!.charCodeAt(0) ^ 1);

    expect(await cipher.decrypt({ ...secret, ciphertext: btoa(tampered.join('')) })).toBeUndefined();
    expect(await cipher.decrypt({ ...secret, ciphertext: '***' })).toBeUndefined();
    expect(await cipher.decrypt({ ...secret, iv: btoa('short') })).toBeUndefined();
  });
});

describe('createAesGcmCipherFactory', () => {
  it('同じ DID の cipher では復号でき、別の DID の cipher では復号できない', async () => {
    const cipherFor = createAesGcmCipherFactory({ key: KEY, aadOf: blueskyCredentialAad })!;
    const secret = await cipherFor('did:plc:alice').encrypt('abcd-efgh-ijkl-mnop');

    expect(await cipherFor('did:plc:alice').decrypt(secret)).toBe('abcd-efgh-ijkl-mnop');
    expect(await cipherFor('did:plc:bob').decrypt(secret)).toBeUndefined();
  });
});
