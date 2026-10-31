import { createECDH } from 'node:crypto';

const unavailable = () => {
  throw new Error('Origin VAPID public key is unavailable.');
};
export async function originVapidPublicKeyMatches({ origin, publicKey, signal, fetchRequest = fetch }) {
  if (typeof publicKey !== 'string' || publicKey.length === 0) throw new Error('Preparation credentials are required.');
  try {
    const response = await fetchRequest(new URL('/api/v1/push/vapid-public-key', origin), {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
    if (!response.ok) unavailable();
    const reader = response.body?.getReader();
    if (!reader) unavailable();
    const chunks = [];
    let size = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        unavailable();
      }
      chunks.push(item.value);
    }
    const body = JSON.parse(await new Blob(chunks).text());
    if (typeof body?.publicKey !== 'string' || body.publicKey.length === 0) unavailable();
    return body.publicKey === publicKey;
  } catch (error) {
    if (signal?.aborted) throw error;
    unavailable();
  }
}
export function vapidKeyPairMatches({ privateKey, publicKey }) {
  const required = () => {
    throw new Error('Preparation credentials are required.');
  };
  if (typeof privateKey !== 'string' || privateKey.length === 0) required();
  if (typeof publicKey !== 'string' || publicKey.length === 0) required();
  try {
    const privateBytes = Buffer.from(privateKey, 'base64url');
    const publicBytes = Buffer.from(publicKey, 'base64url');
    if (privateBytes.byteLength !== 32 || publicBytes.byteLength !== 65 || publicBytes[0] !== 0x04) required();
    if (privateBytes.toString('base64url') !== privateKey || publicBytes.toString('base64url') !== publicKey) {
      required();
    }
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(privateBytes);
    return ecdh.getPublicKey().equals(publicBytes);
  } catch {
    required();
  }
}
export async function assertVapidBeforePreparation({
  environment,
  origin,
  privateKey,
  publicKey,
  signal,
  fetchRequest = fetch,
  log = console.log,
}) {
  const pairMatches = vapidKeyPairMatches({ privateKey, publicKey });
  log(`VAPID key pair match: ${pairMatches ? 'yes' : 'no'}`);
  if (!pairMatches) throw new Error('VAPID key pair does not match.');
  if (environment !== 'production') {
    log('Origin VAPID public key match: skipped');
    return;
  }
  const originMatches = await originVapidPublicKeyMatches({ origin, publicKey, signal, fetchRequest });
  log(`Origin VAPID public key match: ${originMatches ? 'yes' : 'no'}`);
  if (!originMatches) throw new Error('Origin VAPID public key does not match.');
}
