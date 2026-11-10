import { describe, expect, it, vi } from 'vitest';

import { PushSubscriptionId } from '../../domain/pushSubscription/pushSubscriptionId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { createCloudflareWebPushSender } from './cloudflareWebPushSender.ts';

type Bytes = Uint8Array<ArrayBuffer>;

const encodeBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

const decodeBase64Url = (value: string): Bytes => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return new Uint8Array(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));
};

const derive = async (keyMaterial: Bytes, salt: Bytes, info: Bytes, length: number): Promise<Bytes> => {
  const key = await crypto.subtle.importKey('raw', keyMaterial, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
};

describe('createCloudflareWebPushSender', () => {
  it('encrypts the payload, signs VAPID, and delivers it with fetch', async () => {
    const subscriptionKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ]);
    const subscriptionPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', subscriptionKeys.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));

    const vapidKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const vapidPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', vapidKeys.publicKey));
    const vapidPrivateJwk = await crypto.subtle.exportKey('jwk', vapidKeys.privateKey);
    if (vapidPrivateJwk.d === undefined) throw new Error('Generated VAPID key has no private component');

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    const sender = createCloudflareWebPushSender({
      subject: 'mailto:admin@example.com',
      publicKey: encodeBase64Url(vapidPublicKey),
      privateKey: vapidPrivateJwk.d,
    }, { fetch: fetchMock, crypto, now: () => 1_786_080_000_000 });
    const payload = { title: 'Notification', body: 'Worker delivery', url: '/notifications' };

    const result = await sender.send({
      subscriptionId: PushSubscriptionId.generate(),
      userId: UserId.generate(),
      endpoint: 'https://push.example/subscription',
      p256dhKey: encodeBase64Url(subscriptionPublicKey),
      authKey: encodeBase64Url(authSecret),
    }, payload);

    expect(result).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://push.example/subscription');
    expect(init?.method).toBe('POST');

    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(headers.get('Content-Type')).toBe('application/octet-stream');
    expect(headers.get('TTL')).toBe('2419200');

    const authorization = headers.get('Authorization');
    expect(authorization).toMatch(/^vapid t=[^.]+\.[^.]+\.[^,]+, k=/);
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(authorization ?? '');
    if (match === null) throw new Error('Missing VAPID authorization header');
    const [, token, publicKey] = match;
    expect(publicKey).toBe(encodeBase64Url(vapidPublicKey));
    const [encodedHeader, encodedClaims, encodedSignature] = token.split('.');
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedClaims))) as {
      aud: string;
      exp: number;
      sub: string;
    };
    expect(claims).toEqual({
      aud: 'https://push.example',
      exp: 1_786_123_200,
      sub: 'mailto:admin@example.com',
    });
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        vapidKeys.publicKey,
        decodeBase64Url(encodedSignature),
        new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
      ),
    ).toBe(true);

    const body = new Uint8Array(await new Response(init?.body).arrayBuffer());
    const salt = body.slice(0, 16);
    expect(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)).toBe(4096);
    const serverPublicKeyLength = body[20];
    expect(serverPublicKeyLength).toBe(65);
    const serverPublicKey = body.slice(21, 21 + serverPublicKeyLength);
    const ciphertext = body.slice(21 + serverPublicKeyLength);
    const importedServerPublicKey = await crypto.subtle.importKey(
      'raw',
      serverPublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const sharedSecret = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'ECDH', public: importedServerPublicKey },
        subscriptionKeys.privateKey,
        256,
      ),
    );
    const keyInfo = new Uint8Array([
      ...new TextEncoder().encode('WebPush: info\0'),
      ...subscriptionPublicKey,
      ...serverPublicKey,
    ]);
    const inputKeyMaterial = await derive(sharedSecret, authSecret, keyInfo, 32);
    const contentEncryptionKey = await derive(
      inputKeyMaterial,
      salt,
      new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
      16,
    );
    const nonce = await derive(
      inputKeyMaterial,
      salt,
      new TextEncoder().encode('Content-Encoding: nonce\0'),
      12,
    );
    const aesKey = await crypto.subtle.importKey('raw', contentEncryptionKey, 'AES-GCM', false, ['decrypt']);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ciphertext));
    expect(plaintext.at(-1)).toBe(2);
    expect(JSON.parse(new TextDecoder().decode(plaintext.slice(0, -1)))).toEqual(payload);
  });

  it('returns SendError for invalid VAPID configuration', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 410 }));
    const sender = createCloudflareWebPushSender({
      subject: 'mailto:admin@example.com',
      publicKey: 'invalid',
      privateKey: 'invalid',
    }, { fetch: fetchMock, crypto });

    const result = await sender.send({
      subscriptionId: PushSubscriptionId.generate(),
      userId: UserId.generate(),
      endpoint: 'https://push.example/subscription',
      p256dhKey: 'invalid',
      authKey: 'invalid',
    }, { title: 'Notification', body: 'Body' });

    expect(result).toMatchObject({ ok: false, err: { type: 'SendError' } });
  });

  it('rejects a payload that would fill the entire encrypted record', async () => {
    const subscriptionKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ]);
    const subscriptionPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', subscriptionKeys.publicKey));
    const vapidKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const vapidPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', vapidKeys.publicKey));
    const vapidPrivateJwk = await crypto.subtle.exportKey('jwk', vapidKeys.privateKey);
    if (vapidPrivateJwk.d === undefined) throw new Error('Generated VAPID key has no private component');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    const sender = createCloudflareWebPushSender({
      subject: 'mailto:admin@example.com',
      publicKey: encodeBase64Url(vapidPublicKey),
      privateKey: vapidPrivateJwk.d,
    }, { fetch: fetchMock, crypto });
    const emptyPayloadSize = new TextEncoder().encode(JSON.stringify({ title: '', body: '' })).byteLength;

    const result = await sender.send({
      subscriptionId: PushSubscriptionId.generate(),
      userId: UserId.generate(),
      endpoint: 'https://push.example/subscription',
      p256dhKey: encodeBase64Url(subscriptionPublicKey),
      authKey: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    }, { title: '', body: 'x'.repeat(4079 - emptyPayloadSize) });

    expect(result).toMatchObject({ ok: false, err: { type: 'SendError' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
