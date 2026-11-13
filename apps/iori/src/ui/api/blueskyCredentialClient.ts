import z from 'zod/v4';

import { isMastodonApiError, toApiError } from './mastodonClient.ts';

const CREDENTIAL_PATH = '/api/iori/v1/bluesky/credential';
const ACCOUNT_SWITCH_PATH = '/api/iori/v1/bluesky/account-switch';
const ACCOUNT_SWITCH_PREVIEW_PATH = `${ACCOUNT_SWITCH_PATH}/preview`;

const credentialStatusZodType = z.object({
  source: z.enum(['settings', 'secret', 'none']),
  handle: z.string().nullable(),
  did: z.string().nullable(),
  chatPermitted: z.boolean().nullable(),
  verifiedAt: z.string().nullable(),
  registrable: z.boolean(),
});

export type BlueskyCredentialStatus = z.infer<typeof credentialStatusZodType>;

const didMismatchZodType = z.object({
  current: z.object({ did: z.string(), handle: z.string().nullable() }),
  next: z.object({ did: z.string(), handle: z.string() }),
});

export type BlueskyDidMismatch = z.infer<typeof didMismatchZodType>;

const accountSwitchPreviewZodType = z.object({
  counts: z.object({
    timelineItems: z.number(),
    notifications: z.number(),
    likes: z.number(),
    reposts: z.number(),
    bookmarks: z.number(),
    moderatedActors: z.number(),
    crossposts: z.number(),
  }),
});

export type BlueskyAccountSwitchPreview = z.infer<typeof accountSwitchPreviewZodType>;

export type BlueskyAccountSwitchCounts = BlueskyAccountSwitchPreview['counts'];

const accountSwitchStateZodType = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({
    state: z.literal('purging'),
    fromDid: z.string(),
    toDid: z.string(),
    startedAt: z.string(),
    attempts: z.number(),
    lastError: z.string().nullable(),
    stalled: z.boolean(),
  }),
]);

export type BlueskyAccountSwitchState = z.infer<typeof accountSwitchStateZodType>;

export type BlueskyAccountSwitchInput = Readonly<{
  identifier: string;
  appPassword: string;
  currentPassword: string;
  fromDid: string;
  toDid: string;
}>;

export type BlueskyCredentialInput = Readonly<{
  identifier: string;
  appPassword: string;
  currentPassword: string;
}>;

const SAVE_FAILED_MESSAGE = '保存できませんでした。';
const KEY_MISSING_MESSAGE = '登録するにはサーバーの設定が必要です。';
const SWITCH_IN_PROGRESS_MESSAGE = 'アカウントの切り替え中です。終わるまでお待ちください。';
const SWITCH_FAILED_MESSAGE = '切り替えられませんでした。';
const DELETE_FAILED_MESSAGE = '登録を消せませんでした。';

const SAVE_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  invalid_password: 'iori のパスワードが違います。',
  bluesky_login_failed: 'Bluesky にログインできませんでした。ハンドルとアプリパスワードを確かめてください。',
  switch_in_progress: SWITCH_IN_PROGRESS_MESSAGE,
  credential_key_missing: KEY_MISSING_MESSAGE,
};

export const blueskyCredentialSaveFailureMessage = (error: unknown): string =>
  isMastodonApiError(error) ? SAVE_FAILURE_MESSAGES[error.message] ?? SAVE_FAILED_MESSAGE : SAVE_FAILED_MESSAGE;

export const blueskyCredentialLoadFailureMessage = (_error: unknown): string =>
  'Bluesky の連携の状態を読み込めませんでした。';

const DELETE_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  env_account_differs: 'サーバーの secret のアカウントがいまのアカウントと違うため、登録を消せません。',
  switch_in_progress: SWITCH_IN_PROGRESS_MESSAGE,
};

export const blueskyCredentialDeleteFailureMessage = (error: unknown): string =>
  isMastodonApiError(error) ? DELETE_FAILURE_MESSAGES[error.message] ?? DELETE_FAILED_MESSAGE : DELETE_FAILED_MESSAGE;

const SWITCH_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  invalid_password: 'iori のパスワードが違います。',
  bluesky_login_failed: 'Bluesky にログインできませんでした。ハンドルとアプリパスワードを確かめてください。',
  did_changed: 'アカウントの状態が変わりました。もう一度やり直してください。',
  switch_in_progress: SWITCH_IN_PROGRESS_MESSAGE,
  credential_key_missing: KEY_MISSING_MESSAGE,
};

export const blueskyAccountSwitchFailureMessage = (error: unknown): string =>
  isMastodonApiError(error) ? SWITCH_FAILURE_MESSAGES[error.message] ?? SWITCH_FAILED_MESSAGE : SWITCH_FAILED_MESSAGE;

export const isBlueskyAccountChangedError = (error: unknown): boolean =>
  isMastodonApiError(error) && error.message === 'did_changed';

export const blueskyDidMismatchOf = (error: unknown): BlueskyDidMismatch | undefined => {
  if (!isMastodonApiError(error)) return undefined;
  const parsed = didMismatchZodType.safeParse((error as { mismatch?: unknown }).mismatch);
  return parsed.success ? parsed.data : undefined;
};

export const blueskyAccountSwitchCountRows = (
  counts: BlueskyAccountSwitchCounts,
): readonly Readonly<{ label: string; count: number }>[] => [
  { label: 'タイムライン', count: counts.timelineItems },
  { label: '通知', count: counts.notifications },
  { label: 'いいね', count: counts.likes },
  { label: 'リポスト', count: counts.reposts },
  { label: 'ブックマーク', count: counts.bookmarks },
  { label: 'ミュートとブロック', count: counts.moderatedActors },
  { label: 'クロスポストの対応', count: counts.crossposts },
];

const normalizeHandle = (value: string): string => value.trim().replace(/^@/, '').toLowerCase();

export const isBlueskyAccountSwitchConfirmed = (input: string, nextHandle: string): boolean => {
  const normalized = normalizeHandle(input);
  return normalized !== '' && normalized === normalizeHandle(nextHandle);
};

export const blueskyCredentialSourceLabel = (source: BlueskyCredentialStatus['source']): string => {
  switch (source) {
    case 'settings':
      return '設定画面で登録';
    case 'secret':
      return 'サーバーの secret';
    case 'none':
      return '未設定';
  }
};

export const blueskyCredentialChatLabel = (chatPermitted: boolean | null): string => {
  if (chatPermitted === true) return '使えます';
  if (chatPermitted === false) return '使えません';
  return '未確認';
};

export const blueskyCredentialVerifiedAtLabel = (verifiedAt: string | null): string => {
  if (verifiedAt === null) return '未確認';
  const date = new Date(verifiedAt);
  return Number.isNaN(date.getTime()) ? verifiedAt : date.toLocaleString('ja-JP');
};

const parseStatus = (body: unknown): BlueskyCredentialStatus => {
  const parsed = credentialStatusZodType.safeParse(body);
  if (!parsed.success) throw new Error('Unexpected Bluesky credential response');
  return parsed.data;
};

const failureOf = async (res: Response): Promise<Error> => {
  const error = await toApiError(res.clone());
  if (res.status !== 409 || error.message !== 'did_mismatch') return error;
  const mismatch = didMismatchZodType.safeParse(await res.json().catch(() => undefined));
  return mismatch.success ? Object.assign(error, { mismatch: mismatch.data }) : error;
};

const sendJson = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown> => {
  const res = await fetch(path, {
    method,
    headers: body === undefined
      ? { Accept: 'application/json' }
      : { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw await failureOf(res);
  return await res.json();
};

const send = async (method: 'GET' | 'PUT' | 'DELETE', body?: unknown): Promise<BlueskyCredentialStatus> =>
  parseStatus(await sendJson(method, CREDENTIAL_PATH, body));

const parseSwitchState = (body: unknown): BlueskyAccountSwitchState => {
  const parsed = accountSwitchStateZodType.safeParse(body);
  if (!parsed.success) throw new Error('Unexpected Bluesky account switch response');
  return parsed.data;
};

export const fetchBlueskyCredential = (): Promise<BlueskyCredentialStatus> => send('GET');

export const saveBlueskyCredential = (input: BlueskyCredentialInput): Promise<BlueskyCredentialStatus> =>
  send('PUT', {
    identifier: input.identifier,
    appPassword: input.appPassword,
    currentPassword: input.currentPassword,
  });

export const deleteBlueskyCredential = (): Promise<BlueskyCredentialStatus> => send('DELETE');

export const fetchBlueskyAccountSwitchPreview = async (): Promise<BlueskyAccountSwitchPreview> => {
  const parsed = accountSwitchPreviewZodType.safeParse(await sendJson('GET', ACCOUNT_SWITCH_PREVIEW_PATH));
  if (!parsed.success) throw new Error('Unexpected Bluesky account switch preview response');
  return parsed.data;
};

export const startBlueskyAccountSwitch = async (input: BlueskyAccountSwitchInput): Promise<BlueskyAccountSwitchState> =>
  parseSwitchState(
    await sendJson('POST', ACCOUNT_SWITCH_PATH, {
      identifier: input.identifier,
      appPassword: input.appPassword,
      currentPassword: input.currentPassword,
      fromDid: input.fromDid,
      toDid: input.toDid,
    }),
  );

export const fetchBlueskyAccountSwitch = async (): Promise<BlueskyAccountSwitchState> =>
  parseSwitchState(await sendJson('GET', ACCOUNT_SWITCH_PATH));
