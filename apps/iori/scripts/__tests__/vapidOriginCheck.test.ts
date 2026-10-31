import { createECDH } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { originVapidPublicKeyMatches, vapidKeyPairMatches } from '../vapid-origin-check.mjs';

const origin = 'https://iori.example.invalid';
const unavailable = 'Origin VAPID public key is unavailable.';
const respond = (body: BodyInit, init?: ResponseInit) =>
  vi.fn(async (_url: URL, _init: RequestInit) => new Response(body, init));

it('returns true when the origin key matches and requests the fixed URL without redirects', async () => {
  const fetchRequest = respond(JSON.stringify({ publicKey: 'k1' }));
  await expect(originVapidPublicKeyMatches({ origin, publicKey: 'k1', fetchRequest })).resolves.toBe(true);
  expect(String(fetchRequest.mock.calls[0]![0])).toBe('https://iori.example.invalid/api/v1/push/vapid-public-key');
  expect(fetchRequest.mock.calls[0]![1]).toMatchObject({ method: 'GET', redirect: 'error' });
});
it('returns false when the origin key differs', async () => {
  const fetchRequest = respond(JSON.stringify({ publicKey: 'k2' }));
  await expect(originVapidPublicKeyMatches({ origin, publicKey: 'k1', fetchRequest })).resolves.toBe(false);
});
it('rejects a non-200 response', async () => {
  const fetchRequest = respond('{}', { status: 503 });
  await expect(originVapidPublicKeyMatches({ origin, publicKey: 'k1', fetchRequest })).rejects.toThrow(unavailable);
});
it.each([
  ['non-JSON body', 'not json'],
  ['missing publicKey', JSON.stringify({})],
  ['empty publicKey', JSON.stringify({ publicKey: '' })],
])('rejects %s without leaking the key or origin', async (_name, body) => {
  const fetchRequest = respond(body);
  const error = await originVapidPublicKeyMatches({ origin, publicKey: 'k1', fetchRequest }).catch((e: Error) => e);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(unavailable);
  expect((error as Error).message).not.toContain('k1');
  expect((error as Error).message).not.toContain('iori.example.invalid');
});
it('rejects a body over 65536 bytes', async () => {
  const fetchRequest = respond('x'.repeat(65_537));
  await expect(originVapidPublicKeyMatches({ origin, publicKey: 'k1', fetchRequest })).rejects.toThrow(unavailable);
});
it('rejects an empty argument key without calling fetch', async () => {
  const fetchRequest = respond(JSON.stringify({ publicKey: 'k1' }));
  await expect(originVapidPublicKeyMatches({ origin, publicKey: '', fetchRequest })).rejects.toThrow(
    'Preparation credentials are required.',
  );
  expect(fetchRequest).not.toHaveBeenCalled();
});

const keyPair = () => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    privateKey: ecdh.getPrivateKey().toString('base64url'),
    publicKey: ecdh.getPublicKey().toString('base64url'),
  };
};

it('accepts a VAPID public key derived from the private key', () => {
  expect(vapidKeyPairMatches(keyPair())).toBe(true);
});
it('rejects a VAPID public key from another pair', () => {
  const pair = keyPair();
  const other = keyPair();
  expect(vapidKeyPairMatches({ privateKey: pair.privateKey, publicKey: other.publicKey })).toBe(false);
});
it('rejects a malformed VAPID private key without leaking key material', () => {
  const pair = keyPair();
  const privateKey = pair.privateKey.slice(0, 20);
  const error = (() => {
    try {
      vapidKeyPairMatches({ privateKey, publicKey: pair.publicKey });
    } catch (e) {
      return e as Error;
    }
  })();
  expect(error).toBeInstanceOf(Error);
  expect(error!.message).toBe('Preparation credentials are required.');
  expect(error!.message).not.toContain(privateKey);
  expect(error!.message).not.toContain(pair.publicKey);
});
