import { afterEach, describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1DigestRequestUsageRecorder } from '../digestRequest/digestRequestUsageRecorder.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  return { ...fixture, seed };
};

const day = '2026-11-04';
const t0 = Instant.orThrow(Date.UTC(2026, 10, 4, 3, 0, 0));
const after = (ms: number) => Instant.orThrow(t0 + ms);

describe('createD1DigestRequestUsageRecorder', () => {
  it('120 秒未満の再予約は too_soon で拒否し、残り秒数を切り上げて返し、行を変えない', async () => {
    const { db, sqlite, seed } = setup();
    const userId = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const recorder = createD1DigestRequestUsageRecorder(db);
    await recorder.reserve({ userId, day, now: t0 });

    const result = await recorder.reserve({ userId, day, now: after(30_500) });

    expect(result).toEqual({ ok: true, val: { allowed: false, reason: 'too_soon', retryAfterSeconds: 90 } });
    expect(sqlite.prepare('SELECT count, lastRequestedAt FROM digest_request_usages').all()).toEqual([
      { count: 1, lastRequestedAt: t0 },
    ]);
  });

  it('ちょうど 120 秒後の再予約は許可し、count を増やして lastRequestedAt を更新する', async () => {
    const { db, sqlite, seed } = setup();
    const userId = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const recorder = createD1DigestRequestUsageRecorder(db);
    await recorder.reserve({ userId, day, now: t0 });

    const result = await recorder.reserve({ userId, day, now: after(120_000) });

    expect(result).toEqual({ ok: true, val: { allowed: true } });
    expect(sqlite.prepare('SELECT count, lastRequestedAt FROM digest_request_usages').all()).toEqual([
      { count: 2, lastRequestedAt: after(120_000) },
    ]);
  });

  it('3 回予約した後は間隔が空いていても daily_limit で拒否し、翌 JST 0 時までの秒数を返す', async () => {
    const { db, sqlite, seed } = setup();
    const userId = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const recorder = createD1DigestRequestUsageRecorder(db);
    await recorder.reserve({ userId, day, now: t0 });
    await recorder.reserve({ userId, day, now: after(120_000) });
    await recorder.reserve({ userId, day, now: after(240_000) });
    const now = after(3_600_000);

    const result = await recorder.reserve({ userId, day, now });

    expect(result).toEqual({
      ok: true,
      val: {
        allowed: false,
        reason: 'daily_limit',
        retryAfterSeconds: Math.ceil((Date.UTC(2026, 10, 4, 15, 0, 0) - now) / 1000),
      },
    });
    expect(sqlite.prepare('SELECT count FROM digest_request_usages').all()).toEqual([{ count: 3 }]);
  });

  it('3 回予約した直後は daily_limit を too_soon より優先する', async () => {
    const { db, seed } = setup();
    const userId = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const recorder = createD1DigestRequestUsageRecorder(db);
    await recorder.reserve({ userId, day, now: t0 });
    await recorder.reserve({ userId, day, now: after(120_000) });
    await recorder.reserve({ userId, day, now: after(240_000) });

    const result = await recorder.reserve({ userId, day, now: after(240_001) });

    expect(result.ok && result.val).toMatchObject({ allowed: false, reason: 'daily_limit' });
  });
});
