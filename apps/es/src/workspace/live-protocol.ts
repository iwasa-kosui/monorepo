export const liveEndpoint = '/api/hands-on';

export const liveLimits = {
  nameChars: 20,
  textChars: 500,
  frameChars: 4000,
  historyMessages: 200,
  retentionMs: 12 * 60 * 60 * 1000,
  burstMessages: 5,
  burstWindowMs: 10_000,
} as const;

export const pingText = 'ping';
export const pongText = 'pong';

export type LiveMessage = {
  readonly id: string;
  readonly author: string;
  readonly name: string;
  readonly text: string;
  readonly at: number;
};

export type PostFrame = {
  readonly type: 'post';
  readonly id: string;
  readonly name: string;
  readonly text: string;
};

export type RejectReason = 'rate' | 'invalid';

export type ServerFrame =
  | { readonly type: 'hello'; readonly author: string; readonly messages: readonly LiveMessage[] }
  | { readonly type: 'message'; readonly message: LiveMessage }
  | { readonly type: 'rejected'; readonly id: string; readonly reason: RejectReason }
  | { readonly type: 'cleared' };

const idPattern = /^[A-Za-z0-9-]{8,64}$/;

export const isLiveId = (value: unknown): value is string => typeof value === 'string' && idPattern.test(value);

const clip = (text: string, limit: number): string => [...text].slice(0, limit).join('');

/* eslint-disable no-control-regex */
const invisible = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
const invisibleExceptNewline =
  /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
/* eslint-enable no-control-regex */

export const normalizeName = (value: string): string =>
  clip(value.replace(invisible, ' ').replace(/\s+/g, ' ').trim(), liveLimits.nameChars).trim();

export const normalizeText = (value: string): string =>
  clip(
    value.replace(/\r\n?/g, '\n').replace(invisibleExceptNewline, '').replace(/\n{3,}/g, '\n\n').trim(),
    liveLimits.textChars,
  ).trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const parsePostFrame = (raw: string): PostFrame | null => {
  if (raw.length > liveLimits.frameChars) return null;
  const body = parseJson(raw);
  if (!isRecord(body) || body['type'] !== 'post' || !isLiveId(body['id'])) return null;
  if (typeof body['name'] !== 'string' || typeof body['text'] !== 'string') return null;
  const name = normalizeName(body['name']);
  const text = normalizeText(body['text']);
  if (name === '' || text === '') return null;
  return { type: 'post', id: body['id'], name, text };
};

const messageOf = (value: unknown): LiveMessage | null => {
  if (!isRecord(value)) return null;
  const { id, author, name, text, at } = value;
  if (typeof id !== 'string' || typeof author !== 'string' || typeof name !== 'string') return null;
  if (typeof text !== 'string' || typeof at !== 'number') return null;
  return { id, author, name, text, at };
};

export const parseServerFrame = (raw: string): ServerFrame | null => {
  const body = parseJson(raw);
  if (!isRecord(body)) return null;
  if (body['type'] === 'cleared') return { type: 'cleared' };
  if (body['type'] === 'message') {
    const message = messageOf(body['message']);
    return message === null ? null : { type: 'message', message };
  }
  if (body['type'] === 'rejected') {
    const reason = body['reason'];
    if (typeof body['id'] !== 'string' || (reason !== 'rate' && reason !== 'invalid')) return null;
    return { type: 'rejected', id: body['id'], reason };
  }
  if (body['type'] === 'hello') {
    if (typeof body['author'] !== 'string' || !Array.isArray(body['messages'])) return null;
    const messages = (body['messages'] as unknown[]).flatMap((item) => {
      const message = messageOf(item);
      return message === null ? [] : [message];
    });
    return { type: 'hello', author: body['author'], messages };
  }
  return null;
};
