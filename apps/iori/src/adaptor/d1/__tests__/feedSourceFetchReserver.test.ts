import { afterEach, describe, expect, it } from 'vitest';

import { X_MANUAL_FETCH_COOLDOWN_SECONDS } from '../../../domain/feedSource/feedSource.ts';
import { FeedSourceId } from '../../../domain/feedSource/feedSourceId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { createD1FeedSourceFetchReserver } from '../feedSource/feedSourceFetchReserver.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const sourceId = FeedSourceId.orThrow('00000000-0000-4000-8000-000000000001');
const otherSourceId = FeedSourceId.orThrow('00000000-0000-4000-8000-000000000002');
const t0 = Instant.orThrow(Date.UTC(2026, 10, 8, 3, 0, 0));
const after = (ms: number) => Instant.orThrow(t0 + ms);
const COOLDOWN_MS = X_MANUAL_FETCH_COOLDOWN_SECONDS * 1000;

const setup = (lastFetchedAt: number | null = null) => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const insert = fixture.sqlite.prepare(
    'INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,lastFetchedAt,createdAt) VALUES (?,?,?,?,?,?,?)',
  );
  insert.run(sourceId, 'x_user', 'https://x.com/jack', '@jack', 1, lastFetchedAt, 1_000);
  insert.run(otherSourceId, 'x_user', 'https://x.com/alice', '@alice', 1, null, 1_000);
  const lastFetchedAtOf = (id: string) =>
    (fixture.sqlite.prepare('SELECT lastFetchedAt FROM feed_sources WHERE feedSourceId = ?').get(id) as {
      lastFetchedAt: number | null;
    }).lastFetchedAt;
  return { ...fixture, reserver: createD1FeedSourceFetchReserver(fixture.db), lastFetchedAtOf };
};

describe('createD1FeedSourceFetchReserver', () => {
  it('lastFetchedAt が NULL の情報源を予約し、lastFetchedAt に現在時刻を書く', async () => {
    const { reserver, lastFetchedAtOf } = setup(null);

    const result = await reserver.reserve({ feedSourceId: sourceId, now: t0 });

    expect(result).toEqual({ ok: true, val: true });
    expect(lastFetchedAtOf(sourceId)).toBe(t0);
  });

  it('同じ情報源を 2 回続けて予約すると、2 回目は取れず lastFetchedAt を変えない', async () => {
    const { reserver, lastFetchedAtOf } = setup(null);
    await reserver.reserve({ feedSourceId: sourceId, now: t0 });

    const result = await reserver.reserve({ feedSourceId: sourceId, now: after(1_000) });

    expect(result).toEqual({ ok: true, val: false });
    expect(lastFetchedAtOf(sourceId)).toBe(t0);
  });

  it('クールダウンの 1 ミリ秒前は取れず、ちょうど過ぎたら取れる', async () => {
    const { reserver, lastFetchedAtOf } = setup(t0);

    const early = await reserver.reserve({ feedSourceId: sourceId, now: after(COOLDOWN_MS - 1) });
    const exact = await reserver.reserve({ feedSourceId: sourceId, now: after(COOLDOWN_MS) });

    expect(early).toEqual({ ok: true, val: false });
    expect(exact).toEqual({ ok: true, val: true });
    expect(lastFetchedAtOf(sourceId)).toBe(after(COOLDOWN_MS));
  });

  it('対象の情報源だけを更新する', async () => {
    const { reserver, lastFetchedAtOf } = setup(null);

    await reserver.reserve({ feedSourceId: sourceId, now: t0 });

    expect(lastFetchedAtOf(otherSourceId)).toBeNull();
  });
});
