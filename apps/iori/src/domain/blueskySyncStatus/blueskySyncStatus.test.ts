import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { type BlueskySyncStatusRecord, toBlueskyConnectionStatus } from './blueskySyncStatus.ts';

const MINUTE = 60_000;
const at = (minutes: number) => Instant.orThrow(Date.UTC(2026, 10, 12, 0, minutes));
const COOLDOWN = 30 * MINUTE;

const record = (overrides: Partial<BlueskySyncStatusRecord> = {}): BlueskySyncStatusRecord => ({
  scope: 'timeline',
  lastSucceededAt: null,
  lastFailedAt: null,
  lastFailureKind: null,
  lastFailureCode: null,
  ...overrides,
});

const statusOf = (records: readonly BlueskySyncStatusRecord[], loginFailedAt?: Instant, now = at(60)) =>
  toBlueskyConnectionStatus({ records, loginFailedAt, now, loginCooldownMs: COOLDOWN });

describe('toBlueskyConnectionStatus', () => {
  it('成功だけの記録は ok にする', () => {
    const status = statusOf([record({ lastSucceededAt: at(5) })]);

    expect(status.timeline).toEqual({
      state: 'ok',
      lastSucceededAt: at(5),
      lastFailedAt: null,
      failureKind: null,
      failureCode: null,
    });
  });

  it('失敗が成功より新しければ failing にし、失敗の種類とコードを返す', () => {
    const status = statusOf([
      record({
        scope: 'notifications',
        lastSucceededAt: at(5),
        lastFailedAt: at(9),
        lastFailureKind: 'http',
        lastFailureCode: 'UpstreamFailure',
      }),
    ]);

    expect(status.notifications).toEqual({
      state: 'failing',
      lastSucceededAt: at(5),
      lastFailedAt: at(9),
      failureKind: 'http',
      failureCode: 'UpstreamFailure',
    });
    expect(status.timeline.state).toBe('unknown');
  });

  it('成功の記録が無く失敗だけあるときは failing にする', () => {
    const status = statusOf([record({ lastFailedAt: at(9), lastFailureKind: 'network' })]);

    expect(status.timeline.state).toBe('failing');
    expect(status.timeline.lastSucceededAt).toBeNull();
  });

  it('成功が失敗より新しければ ok に戻し、同時刻でも failing にしない', () => {
    const recovered = statusOf([record({ lastSucceededAt: at(10), lastFailedAt: at(9), lastFailureKind: 'auth' })]);
    const same = statusOf([record({ lastSucceededAt: at(10), lastFailedAt: at(10), lastFailureKind: 'auth' })]);

    expect(recovered.timeline.state).toBe('ok');
    expect(same.timeline.state).toBe('ok');
  });

  it('ログインの失敗から待ち時間が過ぎていなければ waiting にし、再試行の時刻を返す', () => {
    const login = statusOf([], at(40), at(60)).login;

    expect(login).toEqual({ state: 'waiting', failedAt: at(40), retryAt: at(70) });
  });

  it('待ち時間が過ぎたら login は ok にする', () => {
    expect(statusOf([], at(10), at(40)).login).toEqual({ state: 'ok' });
    expect(statusOf([], at(10), at(41)).login).toEqual({ state: 'ok' });
  });
});
