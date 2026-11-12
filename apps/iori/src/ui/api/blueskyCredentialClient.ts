import z from 'zod/v4';

import { isMastodonApiError, toApiError } from './mastodonClient.ts';

const CREDENTIAL_PATH = '/api/iori/v1/bluesky/credential';

const credentialStatusZodType = z.object({
  source: z.enum(['settings', 'secret', 'none']),
  handle: z.string().nullable(),
  did: z.string().nullable(),
  chatPermitted: z.boolean().nullable(),
  verifiedAt: z.string().nullable(),
  registrable: z.boolean(),
});

export type BlueskyCredentialStatus = z.infer<typeof credentialStatusZodType>;

export type BlueskyCredentialInput = Readonly<{
  identifier: string;
  appPassword: string;
  currentPassword: string;
}>;

const SAVE_FAILED_MESSAGE = '保存できませんでした。';
const KEY_MISSING_MESSAGE = '登録するにはサーバーの設定が必要です。';

const SAVE_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  invalid_password: 'iori のパスワードが違います。',
  bluesky_login_failed: 'Bluesky にログインできませんでした。ハンドルとアプリパスワードを確かめてください。',
  did_mismatch: 'いま連携している Bluesky のアカウントと違うアカウントは登録できません。',
  credential_key_missing: KEY_MISSING_MESSAGE,
};

export const blueskyCredentialSaveFailureMessage = (error: unknown): string =>
  isMastodonApiError(error) ? SAVE_FAILURE_MESSAGES[error.message] ?? SAVE_FAILED_MESSAGE : SAVE_FAILED_MESSAGE;

export const blueskyCredentialLoadFailureMessage = (_error: unknown): string =>
  'Bluesky の連携の状態を読み込めませんでした。';

export const blueskyCredentialDeleteFailureMessage = (_error: unknown): string => '登録を消せませんでした。';

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

const send = async (method: 'GET' | 'PUT' | 'DELETE', body?: unknown): Promise<BlueskyCredentialStatus> => {
  const res = await fetch(CREDENTIAL_PATH, {
    method,
    headers: body === undefined
      ? { Accept: 'application/json' }
      : { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw await toApiError(res);
  return parseStatus(await res.json());
};

export const fetchBlueskyCredential = (): Promise<BlueskyCredentialStatus> => send('GET');

export const saveBlueskyCredential = (input: BlueskyCredentialInput): Promise<BlueskyCredentialStatus> =>
  send('PUT', {
    identifier: input.identifier,
    appPassword: input.appPassword,
    currentPassword: input.currentPassword,
  });

export const deleteBlueskyCredential = (): Promise<BlueskyCredentialStatus> => send('DELETE');
