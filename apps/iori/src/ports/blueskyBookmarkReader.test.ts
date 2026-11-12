import { describe, expect, it } from 'vitest';

import { isBlueskyBookmarkUnavailable } from './blueskyBookmarkReader.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

const error = (overrides: Partial<BlueskyClientError>): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'failed',
  ...overrides,
});

describe('isBlueskyBookmarkUnavailable', () => {
  it.each(
    [
      ['403 Forbidden', { status: 403, code: 'Forbidden' }],
      ['code の無い 403', { status: 403 }],
      ['501 MethodNotImplemented', { status: 501, code: 'MethodNotImplemented' }],
      ['code の無い 501', { status: 501 }],
      ['400 の MethodNotImplemented', { status: 400, code: 'MethodNotImplemented' }],
      ['code の無い 401', { kind: 'auth', status: 401 }],
      ['401 の知らない権限系の code', { kind: 'auth', status: 401, code: 'PermissionDenied' }],
      ['http の code の無い 401', { kind: 'http', status: 401 }],
      ['http の 401 Unauthorized', { kind: 'http', status: 401, code: 'Unauthorized' }],
    ] as const,
  )('%s を使えないものとみなす', (_name, overrides) => {
    expect(isBlueskyBookmarkUnavailable(error(overrides))).toBe(true);
  });

  it('400 InvalidToken の message に Bad token scope を含むときは使えないものとみなす', () => {
    const rejected = { status: 400, code: 'InvalidToken', message: 'createBookmark failed: Bad token scope' };

    expect(isBlueskyBookmarkUnavailable(error(rejected))).toBe(true);
    expect(isBlueskyBookmarkUnavailable(error({ ...rejected, kind: 'auth' }))).toBe(true);
  });

  it('Bad token scope を含まない InvalidToken と、InvalidToken でない code の Bad token scope は使えないものとみなさない', () => {
    expect(
      isBlueskyBookmarkUnavailable(error({ kind: 'auth', status: 400, code: 'InvalidToken', message: 'Bad token' })),
    )
      .toBe(false);
    expect(isBlueskyBookmarkUnavailable(error({ status: 400, code: 'ExpiredToken', message: 'Bad token scope' })))
      .toBe(false);
  });

  it.each(
    [
      ['ExpiredToken', { kind: 'auth', status: 400, code: 'ExpiredToken' }],
      ['InvalidToken', { kind: 'auth', status: 400, code: 'InvalidToken' }],
      ['401 の AuthRequired', { kind: 'auth', status: 401, code: 'AuthRequired' }],
      ['createSession の 401 AuthenticationRequired', { kind: 'auth', status: 401, code: 'AuthenticationRequired' }],
      ['403 でも InvalidToken', { status: 403, code: 'InvalidToken' }],
      ['http の 401 ExpiredToken', { kind: 'http', status: 401, code: 'ExpiredToken' }],
    ] as const,
  )('%s はログイン切れの扱いにして、使えないものとみなさない', (_name, overrides) => {
    expect(isBlueskyBookmarkUnavailable(error(overrides))).toBe(false);
  });

  it('ログインの待機中、500、ネットワークの失敗、不正な応答は使えないものとみなさない', () => {
    expect(isBlueskyBookmarkUnavailable(error({ kind: 'auth' }))).toBe(false);
    expect(isBlueskyBookmarkUnavailable(error({ status: 500, code: 'InternalServerError' }))).toBe(false);
    expect(isBlueskyBookmarkUnavailable(error({ status: 429, code: 'RateLimitExceeded' }))).toBe(false);
    expect(isBlueskyBookmarkUnavailable(error({ kind: 'network' }))).toBe(false);
    expect(isBlueskyBookmarkUnavailable(error({ kind: 'invalid_response' }))).toBe(false);
    expect(isBlueskyBookmarkUnavailable(error({ kind: 'chat_not_permitted', status: 400, code: 'InvalidToken' })))
      .toBe(false);
  });
});
