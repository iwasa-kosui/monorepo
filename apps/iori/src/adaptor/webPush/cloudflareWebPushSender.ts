import { RA } from '@iwasa-kosui/result';

import type { PushSubscription } from '../../domain/pushSubscription/pushSubscription.ts';
import type { PushPayload, SendError, WebPushSender } from './webPush.ts';

const RECORD_SIZE = 4096;
const MAX_PAYLOAD_SIZE = RECORD_SIZE - 18;
const DEFAULT_TTL_SECONDS = 28 * 24 * 60 * 60;
const VAPID_EXPIRATION_SECONDS = 12 * 60 * 60;

type VapidDetails = Readonly<{
  subject: string;
  publicKey?: string;
  privateKey?: string;
}>;

type CloudflareWebPushDeps = Readonly<{
  fetch?: typeof fetch;
  crypto?: Crypto;
  now?: () => number;
}>;

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

const concatBytes = (...parts: readonly Uint8Array[]): Bytes => {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

const decodeBase64Url = (value: string): Bytes => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Expected unpadded base64url data');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return new Uint8Array(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));
};

const encodeBase64Url = (value: Uint8Array): string =>
  btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

const deriveHkdf = async (
  webCrypto: Crypto,
  keyMaterial: Bytes,
  salt: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> => {
  const key = await webCrypto.subtle.importKey('raw', keyMaterial, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await webCrypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      key,
      length * 8,
    ),
  );
};

const createVapidAuthorization = async (
  webCrypto: Crypto,
  details: Required<VapidDetails>,
  audience: string,
  now: number,
): Promise<string> => {
  const publicKey = decodeBase64Url(details.publicKey);
  const privateKey = decodeBase64Url(details.privateKey);
  if (publicKey.byteLength !== 65 || publicKey[0] !== 4) {
    throw new Error('VAPID public key must be an uncompressed 65-byte P-256 key');
  }
  if (privateKey.byteLength !== 32) throw new Error('VAPID private key must be 32 bytes');

  const subject = new URL(details.subject);
  if (subject.protocol !== 'https:' && subject.protocol !== 'mailto:') {
    throw new Error('VAPID subject must use https: or mailto:');
  }

  const signingKey = await webCrypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: encodeBase64Url(publicKey.slice(1, 33)),
      y: encodeBase64Url(publicKey.slice(33, 65)),
      d: encodeBase64Url(privateKey),
      ext: true,
      key_ops: ['sign'],
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = encodeBase64Url(encoder.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(now / 1000) + VAPID_EXPIRATION_SECONDS,
    sub: details.subject,
  })));
  const unsignedToken = `${header}.${claims}`;
  const signature = new Uint8Array(
    await webCrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      encoder.encode(unsignedToken),
    ),
  );
  return `vapid t=${unsignedToken}.${encodeBase64Url(signature)}, k=${details.publicKey}`;
};

const encryptPayload = async (
  webCrypto: Crypto,
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<Bytes> => {
  const userPublicKeyBytes = decodeBase64Url(subscription.p256dhKey);
  const authSecret = decodeBase64Url(subscription.authKey);
  if (userPublicKeyBytes.byteLength !== 65 || userPublicKeyBytes[0] !== 4) {
    throw new Error('Subscription p256dh key must be an uncompressed 65-byte P-256 key');
  }
  if (authSecret.byteLength < 16) throw new Error('Subscription auth key must be at least 16 bytes');

  const payloadBytes = encoder.encode(JSON.stringify(payload));
  if (payloadBytes.byteLength > MAX_PAYLOAD_SIZE) {
    throw new Error(`Web Push payload exceeds ${MAX_PAYLOAD_SIZE} bytes`);
  }

  const userPublicKey = await webCrypto.subtle.importKey(
    'raw',
    userPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const serverKeys = await webCrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const serverPublicKey = new Uint8Array(await webCrypto.subtle.exportKey('raw', serverKeys.publicKey));
  const sharedSecret = new Uint8Array(
    await webCrypto.subtle.deriveBits(
      { name: 'ECDH', public: userPublicKey },
      serverKeys.privateKey,
      256,
    ),
  );
  const inputKeyMaterial = await deriveHkdf(
    webCrypto,
    sharedSecret,
    authSecret,
    concatBytes(encoder.encode('WebPush: info\0'), userPublicKeyBytes, serverPublicKey),
    32,
  );
  const salt = webCrypto.getRandomValues(new Uint8Array(16));
  const contentEncryptionKey = await deriveHkdf(
    webCrypto,
    inputKeyMaterial,
    salt,
    encoder.encode('Content-Encoding: aes128gcm\0'),
    16,
  );
  const nonce = await deriveHkdf(
    webCrypto,
    inputKeyMaterial,
    salt,
    encoder.encode('Content-Encoding: nonce\0'),
    12,
  );
  const aesKey = await webCrypto.subtle.importKey('raw', contentEncryptionKey, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await webCrypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      concatBytes(payloadBytes, new Uint8Array([2])),
    ),
  );
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE);

  return concatBytes(salt, recordSize, new Uint8Array([serverPublicKey.byteLength]), serverPublicKey, ciphertext);
};

const requiredVapidDetails = (details: VapidDetails): Required<VapidDetails> => {
  if (details.publicKey === undefined || details.privateKey === undefined) {
    throw new Error('Worker Web Push requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
  }
  return { ...details, publicKey: details.publicKey, privateKey: details.privateKey };
};

export const createCloudflareWebPushSender = (
  vapidDetails: VapidDetails,
  deps: CloudflareWebPushDeps = {},
): WebPushSender => {
  const webCrypto = deps.crypto ?? globalThis.crypto;
  const fetchRequest = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;

  return {
    send: async (subscription, payload): RA<void, SendError> => {
      try {
        const details = requiredVapidDetails(vapidDetails);
        const endpoint = new URL(subscription.endpoint);
        const body = await encryptPayload(webCrypto, subscription, payload);
        const authorization = await createVapidAuthorization(webCrypto, details, endpoint.origin, now());
        const response = await fetchRequest(endpoint.href, {
          method: 'POST',
          headers: {
            Authorization: authorization,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(DEFAULT_TTL_SECONDS),
            Urgency: 'normal',
          },
          body: body.buffer,
        });
        if (!response.ok) {
          return RA.err({
            type: 'SendError',
            message: `Web Push request failed with status ${response.status}`,
            statusCode: response.status,
          });
        }
        return RA.ok(undefined);
      } catch (error) {
        return RA.err({ type: 'SendError', message: String(error) });
      }
    },
  };
};
