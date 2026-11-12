import { describe, expect, it } from 'vitest';

import type { BlueskyClientError } from './blueskyClient.ts';
import { isBlueskyActorBlocked, isBlueskyProfileNotFound } from './blueskyProfileReader.ts';

const error = (overrides: Partial<BlueskyClientError>): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'failed',
  ...overrides,
});

describe('isBlueskyProfileNotFound', () => {
  it('HTTP 400 の InvalidRequest を見つからないとみなす', () => {
    expect(isBlueskyProfileNotFound(error({ status: 400, code: 'InvalidRequest' }))).toBe(true);
  });

  it('AccountTakedown と AccountDeactivated を見つからないとみなす', () => {
    expect(isBlueskyProfileNotFound(error({ status: 400, code: 'AccountTakedown' }))).toBe(true);
    expect(isBlueskyProfileNotFound(error({ status: 400, code: 'AccountDeactivated' }))).toBe(true);
  });

  it('認証の失敗、500、ネットワークの失敗、code の無い 400 は見つからないとみなさない', () => {
    expect(isBlueskyProfileNotFound(error({ kind: 'auth', status: 401 }))).toBe(false);
    expect(isBlueskyProfileNotFound(error({ status: 500, code: 'InternalServerError' }))).toBe(false);
    expect(isBlueskyProfileNotFound(error({ kind: 'network' }))).toBe(false);
    expect(isBlueskyProfileNotFound(error({ status: 400 }))).toBe(false);
    expect(isBlueskyProfileNotFound(error({ status: 500, code: 'InvalidRequest' }))).toBe(false);
  });
});

describe('isBlueskyActorBlocked', () => {
  it('HTTP 400 の BlockedActor と BlockedByActor をブロック関係とみなす', () => {
    expect(isBlueskyActorBlocked(error({ status: 400, code: 'BlockedActor' }))).toBe(true);
    expect(isBlueskyActorBlocked(error({ status: 400, code: 'BlockedByActor' }))).toBe(true);
  });

  it('ほかの失敗、code の無い 400、400 以外の status はブロック関係とみなさない', () => {
    expect(isBlueskyActorBlocked(error({ status: 400, code: 'InvalidRequest' }))).toBe(false);
    expect(isBlueskyActorBlocked(error({ status: 400 }))).toBe(false);
    expect(isBlueskyActorBlocked(error({ status: 500, code: 'BlockedActor' }))).toBe(false);
    expect(isBlueskyActorBlocked(error({ kind: 'network' }))).toBe(false);
  });
});
