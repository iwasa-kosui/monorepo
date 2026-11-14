import { describe, expect, it } from 'vitest';

import { PasskeyApiError } from '../api/passkeyClient.ts';
import {
  formatPasskeyTimestamp,
  isPasskeyCancellation,
  PASSKEY_INVALID_PASSWORD_MESSAGE,
  PASSKEY_REGISTER_FAILED_MESSAGE,
  PASSKEY_SIGN_IN_FAILED_MESSAGE,
  passkeyRegistrationFailureMessage,
  passkeySignInFailureMessage,
} from './passkeyUi.ts';

const domException = (name: string) => new DOMException('message', name);

describe('isPasskeyCancellation', () => {
  it.each(['NotAllowedError', 'AbortError'])('%s は取り消しとして扱う', (name) => {
    expect(isPasskeyCancellation(domException(name))).toBe(true);
  });

  it('name だけを持つエラーも取り消しとして扱う', () => {
    const error = Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
    expect(isPasskeyCancellation(error)).toBe(true);
  });

  it('それ以外のエラーと値は取り消しとして扱わない', () => {
    expect(isPasskeyCancellation(domException('SecurityError'))).toBe(false);
    expect(isPasskeyCancellation(new Error('boom'))).toBe(false);
    expect(isPasskeyCancellation(new PasskeyApiError(401, 'authentication_failed'))).toBe(false);
    expect(isPasskeyCancellation(undefined)).toBe(false);
    expect(isPasskeyCancellation('NotAllowedError')).toBe(false);
  });
});

describe('passkeySignInFailureMessage', () => {
  it('取り消しと中断では何も出さない', () => {
    expect(passkeySignInFailureMessage(domException('NotAllowedError'))).toBeUndefined();
    expect(passkeySignInFailureMessage(domException('AbortError'))).toBeUndefined();
  });

  it('サーバーの拒否も通信の失敗も同じ文面にする', () => {
    expect(passkeySignInFailureMessage(new PasskeyApiError(401, 'authentication_failed')))
      .toBe(PASSKEY_SIGN_IN_FAILED_MESSAGE);
    expect(passkeySignInFailureMessage(new TypeError('Failed to fetch'))).toBe(PASSKEY_SIGN_IN_FAILED_MESSAGE);
  });
});

describe('passkeyRegistrationFailureMessage', () => {
  it('取り消しでは何も出さない', () => {
    expect(passkeyRegistrationFailureMessage(domException('NotAllowedError'))).toBeUndefined();
  });

  it('invalid_password はパスワードが違うことを伝える', () => {
    expect(passkeyRegistrationFailureMessage(new PasskeyApiError(400, 'invalid_password')))
      .toBe(PASSKEY_INVALID_PASSWORD_MESSAGE);
  });

  it('その他の失敗は登録できなかったことを伝える', () => {
    expect(passkeyRegistrationFailureMessage(new PasskeyApiError(400, 'registration_failed')))
      .toBe(PASSKEY_REGISTER_FAILED_MESSAGE);
    expect(passkeyRegistrationFailureMessage(new PasskeyApiError(401, 'unauthorized')))
      .toBe(PASSKEY_REGISTER_FAILED_MESSAGE);
    expect(passkeyRegistrationFailureMessage(domException('InvalidStateError'))).toBe(PASSKEY_REGISTER_FAILED_MESSAGE);
  });
});

describe('formatPasskeyTimestamp', () => {
  it('ja-JP の形式で指定したタイムゾーンの日時にする', () => {
    expect(formatPasskeyTimestamp('2026-01-02T03:04:05.000Z', 'Asia/Tokyo')).toBe('2026/1/2 12:04:05');
  });

  it('日時として読めない文字列はそのまま返す', () => {
    expect(formatPasskeyTimestamp('not-a-date')).toBe('not-a-date');
  });
});
