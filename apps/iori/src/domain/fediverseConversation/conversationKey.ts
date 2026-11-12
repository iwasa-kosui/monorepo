import { Result } from '@iwasa-kosui/result';

export const FEDIVERSE_CONVERSATION_MAX_PEERS = 10;
export const FEDIVERSE_CONVERSATION_MAX_URI_LENGTH = 512;
export const FEDIVERSE_CONVERSATION_MAX_KEY_LENGTH = 8192;

export type FediverseConversationKeyInvalid = Readonly<{
  type: 'FediverseConversationKeyInvalid';
  reason: 'empty' | 'too_many_peers' | 'too_long' | 'malformed' | 'invalid_uri';
}>;

const invalid = (reason: FediverseConversationKeyInvalid['reason']): FediverseConversationKeyInvalid => ({
  type: 'FediverseConversationKeyInvalid',
  reason,
});

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const isActorUri = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > FEDIVERSE_CONVERSATION_MAX_URI_LENGTH) {
    return false;
  }
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

const toBase64Url = (text: string): string => {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const fromBase64Url = (key: string): string | undefined => {
  try {
    const base64 = key.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return undefined;
  }
};

const normalize = (peerUris: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(peerUris)].sort();

const check = (peerUris: ReadonlyArray<unknown>): Result<ReadonlyArray<string>, FediverseConversationKeyInvalid> => {
  if (peerUris.length === 0) return Result.err(invalid('empty'));
  if (!peerUris.every(isActorUri)) return Result.err(invalid('invalid_uri'));
  const normalized = normalize(peerUris);
  return normalized.length > FEDIVERSE_CONVERSATION_MAX_PEERS
    ? Result.err(invalid('too_many_peers'))
    : Result.ok(normalized);
};

const encode = (peerUris: ReadonlyArray<string>): Result<string, FediverseConversationKeyInvalid> => {
  const checked = check(peerUris);
  return checked.ok ? Result.ok(toBase64Url(JSON.stringify(checked.val))) : checked;
};

const decode = (key: string): Result<ReadonlyArray<string>, FediverseConversationKeyInvalid> => {
  if (key.length === 0 || !base64UrlPattern.test(key)) return Result.err(invalid('malformed'));
  if (key.length > FEDIVERSE_CONVERSATION_MAX_KEY_LENGTH) return Result.err(invalid('too_long'));
  const json = fromBase64Url(key);
  if (json === undefined) return Result.err(invalid('malformed'));
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return Result.err(invalid('malformed'));
  }
  if (!Array.isArray(parsed)) return Result.err(invalid('malformed'));
  const checked = check(parsed);
  if (!checked.ok) return checked;
  return checked.val.length === parsed.length && checked.val.every((uri, index) => uri === parsed[index])
    ? checked
    : Result.err(invalid('malformed'));
};

export const FediverseConversationKey = { encode, decode } as const;
