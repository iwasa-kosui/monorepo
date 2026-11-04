import { afterEach, describe, expect, it } from 'vitest';

import { DIGEST_DEEP_DIVE_DAILY_LIMIT } from '../../../domain/digestDeepDive/digestDeepDiveLimit.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1DigestDeepDiveUsageRecorder } from '../digestDeepDive/digestDeepDiveUsageRecorder.ts';
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
const now = Instant.orThrow(Date.UTC(2026, 10, 4, 3, 0, 0));

describe('createD1DigestDeepDiveUsageRecorder', () => {
  it('1 日の上限は 3 回', () => {
    expect(DIGEST_DEEP_DIVE_DAILY_LIMIT).toBe(3);
  });

  it('最初の予約は許可し、残りを 2 にして count を書く', async () => {
    const { db, sqlite, seed } = setup();
    const userId = UserId.orThrow(seed.addLocalActor('kosui').userId);

    const result = await createD1DigestDeepDiveUsageRecorder(db).reserve({ userId, day, now });

    expect(result).toEqual({ ok: true, val: { allowed: true, remaining: 2 } });
    expect(sqlite.prepare('SELECT count FROM digest_deep_dive_usages').all()).toEqual([{ count: 1 }]);
  });

  it('3 回目まで許可して残りを数え、4 回目は拒否して翌 JST 0 時までの秒数を返し、count を増やさない', async () => {
    const { db, sqlite, seed } = setup();
    const userId = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const recorder = createD1DigestDeepDiveUsageRecorder(db);

    const results = [
      await recorder.reserve({ userId, day, now }),
      await recorder.reserve({ userId, day, now }),
      await recorder.reserve({ userId, day, now }),
      await recorder.reserve({ userId, day, now }),
    ];

    expect(results.map((result) => result.val)).toEqual([
      { allowed: true, remaining: 2 },
      { allowed: true, remaining: 1 },
      { allowed: true, remaining: 0 },
      { allowed: false, retryAfterSeconds: Math.ceil((Date.UTC(2026, 10, 4, 15, 0, 0) - now) / 1000) },
    ]);
    expect(sqlite.prepare('SELECT count FROM digest_deep_dive_usages').all()).toEqual([{ count: 3 }]);
  });

  it('日付が変わると 1 から数え直す', async () => {
    const { db, seed } = setup();
    const userId = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const recorder = createD1DigestDeepDiveUsageRecorder(db);
    for (let i = 0; i < 3; i += 1) await recorder.reserve({ userId, day, now });

    const result = await recorder.reserve({ userId, day: '2026-11-05', now });

    expect(result).toEqual({ ok: true, val: { allowed: true, remaining: 2 } });
  });

  it('利用者ごとに数える', async () => {
    const { db, seed } = setup();
    const kosui = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const alice = UserId.orThrow(seed.addLocalActor('alice').userId);
    const recorder = createD1DigestDeepDiveUsageRecorder(db);
    for (let i = 0; i < 3; i += 1) await recorder.reserve({ userId: kosui, day, now });

    const result = await recorder.reserve({ userId: alice, day, now });

    expect(result).toEqual({ ok: true, val: { allowed: true, remaining: 2 } });
  });

  it('remaining は予約せずに今日の残り回数を返し、予約の無い日は 3 を返す', async () => {
    const { db, sqlite, seed } = setup();
    const userId = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const recorder = createD1DigestDeepDiveUsageRecorder(db);

    const before = await recorder.remaining({ userId, day });
    await recorder.reserve({ userId, day, now });
    const after = await recorder.remaining({ userId, day });

    expect(before).toEqual({ ok: true, val: 3 });
    expect(after).toEqual({ ok: true, val: 2 });
    expect(sqlite.prepare('SELECT count FROM digest_deep_dive_usages').all()).toEqual([{ count: 1 }]);
  });
});
