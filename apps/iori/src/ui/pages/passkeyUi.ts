import { isPasskeyApiError } from '../api/passkeyClient.ts';

export const PASSKEY_SIGN_IN_FAILED_MESSAGE = 'パスキーでログインできませんでした';
export const PASSKEY_REGISTER_FAILED_MESSAGE = 'パスキーを登録できませんでした';
export const PASSKEY_INVALID_PASSWORD_MESSAGE = 'パスワードが違います';
export const PASSKEY_DELETE_FAILED_MESSAGE = 'パスキーを削除できませんでした';
export const PASSKEY_LOAD_FAILED_MESSAGE = 'パスキーの一覧を読み込めませんでした';
export const PASSKEY_NEVER_USED_LABEL = '未使用';

export const isPasskeyCancellation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error
  && (error.name === 'NotAllowedError' || error.name === 'AbortError');

export const passkeySignInFailureMessage = (error: unknown): string | undefined =>
  isPasskeyCancellation(error) ? undefined : PASSKEY_SIGN_IN_FAILED_MESSAGE;

export const passkeyRegistrationFailureMessage = (error: unknown): string | undefined => {
  if (isPasskeyCancellation(error)) return undefined;
  if (isPasskeyApiError(error) && error.code === 'invalid_password') return PASSKEY_INVALID_PASSWORD_MESSAGE;
  return PASSKEY_REGISTER_FAILED_MESSAGE;
};

export const formatPasskeyTimestamp = (iso: string, timeZone?: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('ja-JP', timeZone === undefined ? {} : { timeZone });
};

export const formatPasskeyLastUsedAt = (iso: string | null, timeZone?: string): string =>
  iso === null ? PASSKEY_NEVER_USED_LABEL : formatPasskeyTimestamp(iso, timeZone);
