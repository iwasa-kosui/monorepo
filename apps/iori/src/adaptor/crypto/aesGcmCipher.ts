import type { EncryptedSecret, SecretCipher } from '../../ports/secretCipher.ts';

const KEY_BYTES = 32;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> | undefined => {
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    return toBase64(bytes) === value ? bytes : undefined;
  } catch {
    return undefined;
  }
};

export const decodeAesGcmKey = (base64: string | undefined): Uint8Array | undefined => {
  const trimmed = base64?.trim();
  if (trimmed === undefined || trimmed === '') return undefined;
  const bytes = fromBase64(trimmed);
  return bytes?.length === KEY_BYTES ? bytes : undefined;
};

export const createAesGcmCipher = (
  input: Readonly<{ key: string | undefined; aad: string }>,
): SecretCipher | undefined => {
  const keyBytes = decodeAesGcmKey(input.key);
  if (keyBytes === undefined) return undefined;
  const additionalData = encoder.encode(input.aad);
  let cryptoKey: Promise<CryptoKey> | undefined;
  const loadKey = (): Promise<CryptoKey> =>
    cryptoKey ??= crypto.subtle.importKey('raw', keyBytes.slice().buffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {
    encrypt: async (plaintext): Promise<EncryptedSecret> => {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData },
        await loadKey(),
        encoder.encode(plaintext),
      );
      return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
    },
    decrypt: async (secret) => {
      const ciphertext = fromBase64(secret.ciphertext);
      const iv = fromBase64(secret.iv);
      if (ciphertext === undefined || iv === undefined || iv.length !== IV_BYTES) return undefined;
      try {
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv, additionalData },
          await loadKey(),
          ciphertext,
        );
        return decoder.decode(decrypted);
      } catch {
        return undefined;
      }
    },
  };
};
