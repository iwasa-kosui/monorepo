import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../src/adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../src/adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1TimelineItemDeletedStore } from '../../src/adaptor/d1/timeline/timelineItemDeletedStore.ts';
import { Instant } from '../../src/domain/instant/instant.ts';
import { TimelineItem } from '../../src/domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../src/domain/timeline/timelineItemId.ts';
import {
  applySql,
  deleteFailureLines,
  deleteUnfollowedPosts,
  dryRunSql,
} from '../delete-unfollowed-posts.mjs';

const accountId = 'b'.repeat(32);
const token = 'api-token-value-for-fixture-0123456789';
const generation = 'prd20261102a';
const databaseName = `iori-production-${generation}`;
const databaseUuid = '11111111-1111-4111-8111-111111111111';
const databasePath = `/accounts/${accountId}/d1/database/${databaseUuid}`;
const before = 5_000;
const now = 1_800_000_000_000;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const env = (overrides: Record<string, string | undefined> = {}) => ({
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: generation,
  IORI_REPOST_CREATED_BEFORE_MS: String(before),
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: token,
  ...overrides,
});
const diag = (stage: string, reason: string) =>
  `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`;
const json = (result: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, errors: [], messages: [], result }), { status });

type Fixture = ReturnType<typeof createSqliteD1Fixture>;
const count = (fixture: Fixture, table: string, where = '1 = 1') =>
  Number(
    (fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number | bigint }).n,
  );
const rows = (fixture: Fixture, sql: string) => fixture.sqlite.prepare(sql).all() as Array<Record<string, unknown>>;

const build = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const local = seed.addLocalActor('alice');
  const followed = seed.addRemoteActor('followed');
  const unfollowed1 = seed.addRemoteActor('unfollowed1');
  const unfollowed2 = seed.addRemoteActor('unfollowed2');
  const followedByRemoteOnly = seed.addRemoteActor('remote-followed');
  const remoteFollower = seed.addRemoteActor('remote-follower');
  const author = seed.addRemoteActor('author');
  seed.addFollow(local.actorId, followed.actorId);
  seed.addFollow(remoteFollower.actorId, followedByRemoteOnly.actorId);
  const timelinePost = (actor: { actorId: string }, createdAt: number) =>
    seed.addRemotePost(actor, createdAt, { timeline: true });
  const targets = {
    u1a: timelinePost(unfollowed1, 1_000),
    u1b: timelinePost(unfollowed1, 2_000),
    u2a: timelinePost(unfollowed2, 500),
    remoteFollowed: timelinePost(followedByRemoteOnly, 3_000),
    boundary: timelinePost(unfollowed2, before),
  };
  const kept = {
    followed: timelinePost(followed, 1_500),
    local: seed.addLocalPost(local, 1_600),
    newer: timelinePost(unfollowed1, before + 1),
    deleted: timelinePost(unfollowed1, 3_500),
    repost: seed.addRepost(unfollowed1.actorId, seed.addRemotePost(author, 100).postId, 1_000),
  };
  fixture.sqlite.prepare('UPDATE timeline_items SET deletedAt = 3600 WHERE timelineItemId = ?').run(
    kept.deleted.timelineItemId!,
  );
  return { fixture, seed, local, unfollowed1, targets, kept };
};

type Call = { method: string; path: string; sql?: string };
const fakeFetch = (fixture: Fixture, options: { names?: string[]; uuid?: string } = {}) => {
  const calls: Call[] = [];
  const fetchRequest = async (url: URL, init: RequestInit) => {
    const path = url.pathname.replace('/client/v4', '');
    const method = String(init.method);
    const sql = init.body === undefined ? undefined : (JSON.parse(String(init.body)) as { sql: string }).sql;
    calls.push({ method, path, sql });
    if (method === 'GET' && path === `/accounts/${accountId}/d1/database`) {
      const items = (options.names ?? [databaseName, 'iori']).map((name) => ({
        name,
        uuid: options.uuid ?? databaseUuid,
      }));
      return json(items);
    }
    if (method === 'GET' && path === databasePath) return json({ name: databaseName, uuid: databaseUuid });
    if (method === 'POST' && path === `${databasePath}/query`) {
      fixture.sqlite.exec('BEGIN');
      try {
        const results = sql!.split(';\n').map((statement) => {
          const prepared = fixture.sqlite.prepare(statement);
          return /^\s*SELECT/i.test(statement)
            ? { results: prepared.all(), success: true, meta: {} }
            : (prepared.run(), { results: [], success: true, meta: {} });
        });
        fixture.sqlite.exec('COMMIT');
        return json(results);
      } catch (error) {
        fixture.sqlite.exec('ROLLBACK');
        throw error;
      }
    }
    return json(null, 404);
  };
  return { calls, fetchRequest: fetchRequest as unknown as typeof fetch };
};
const run = async (
  mode: 'dry-run' | 'apply',
  fixture: Fixture,
  overrides: Record<string, string | undefined> = {},
  options: { names?: string[]; uuid?: string; at?: number } = {},
) => {
  const { calls, fetchRequest } = fakeFetch(fixture, options);
  const notices: string[] = [];
  let error: unknown;
  try {
    await deleteUnfollowedPosts({
      env: env(overrides),
      mode,
      fetchRequest,
      notice: (line) => notices.push(line),
      now: options.at ?? now,
    });
  } catch (caught) {
    error = caught;
  }
  const queries = calls.filter((call) => call.method === 'POST').map((call) => call.sql!);
  return { calls, queries, notices, error };
};
const snapshot = (fixture: Fixture) => ({
  timelineItems: rows(fixture, 'SELECT * FROM timeline_items ORDER BY timelineItemId'),
  federated: rows(fixture, 'SELECT * FROM federated_timeline_items ORDER BY federatedTimelineItemId'),
  events: rows(fixture, 'SELECT * FROM domain_events ORDER BY eventId'),
});
const ids = (...items: Array<{ timelineItemId?: string }>) => items.map((item) => item.timelineItemId!).sort();
const timelineIds = (fixture: Fixture, where: string) =>
  rows(fixture, `SELECT timelineItemId FROM timeline_items WHERE ${where}`).map((row) => String(row.timelineItemId))
    .sort();

describe('delete-unfollowed-posts input checks', () => {
  it.each([
    ['empty', { IORI_REPOST_CREATED_BEFORE_MS: '' }],
    ['missing', { IORI_REPOST_CREATED_BEFORE_MS: undefined }],
    ['not digits', { IORI_REPOST_CREATED_BEFORE_MS: 'abc' }],
    ['a decimal', { IORI_REPOST_CREATED_BEFORE_MS: '1.5' }],
    ['negative', { IORI_REPOST_CREATED_BEFORE_MS: '-1' }],
    ['zero', { IORI_REPOST_CREATED_BEFORE_MS: '0' }],
    ['in the future', { IORI_REPOST_CREATED_BEFORE_MS: String(now + 1) }],
    ['staging', { IORI_ENVIRONMENT: 'staging' }],
    ['without a generation', { IORI_GENERATION: '' }],
    ['with a bad account id', { CLOUDFLARE_ACCOUNT_ID: 'not-hex' }],
  ])('fails without any request when the input is %s', async (_label, overrides) => {
    for (const mode of ['dry-run', 'apply'] as const) {
      const { fixture } = build();
      const { calls, error, notices } = await run(mode, fixture, overrides);
      expect(calls).toEqual([]);
      expect(notices).toEqual([]);
      expect(deleteFailureLines(error)).toEqual([diag('delete-posts', 'config-invalid')]);
    }
  });
  it.each(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])(
    'fails without any request when %s is empty',
    async (name) => {
      const { fixture } = build();
      const { calls, error } = await run('apply', fixture, { [name]: '' });
      expect(calls).toEqual([]);
      expect(deleteFailureLines(error)).toEqual([diag('delete-posts', 'credentials-missing')]);
    },
  );
  it.each([
    ['is missing', [], 'resource-missing'],
    ['is listed twice', [databaseName, databaseName], 'resource-ambiguous'],
  ])('fails without a query when the D1 name %s', async (_label, names, reason) => {
    for (const mode of ['dry-run', 'apply'] as const) {
      const { fixture } = build();
      const { calls, error } = await run(mode, fixture, {}, { names });
      expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
      expect(deleteFailureLines(error)).toEqual([diag('delete-posts-resolve', reason)]);
    }
  });
  it('keeps the token, the account id and ids out of the failure lines', async () => {
    const { fixture } = build();
    const { error } = await run('apply', fixture, {}, { names: [] });
    for (const line of deleteFailureLines(error)) {
      expect(line).not.toContain(token);
      expect(line).not.toContain(accountId);
      expect(line).not.toContain(databaseUuid);
    }
  });
});

describe('delete-unfollowed-posts SQL', () => {
  it('sends one SELECT statement for a dry-run, counts the targets and changes nothing', async () => {
    const { fixture } = build();
    const beforeRun = snapshot(fixture);
    const { queries, notices, error } = await run('dry-run', fixture);
    expect(error).toBeUndefined();
    expect(queries).toEqual([dryRunSql(before)]);
    expect(queries[0]).toMatch(/^SELECT /);
    expect(queries[0]).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH)\b/i);
    expect(queries[0]).not.toContain(';');
    expect(notices).toEqual(['IORI_NOTICE delete-unfollowed-posts mode=dry-run targets=5 federated=0']);
    expect(snapshot(fixture)).toEqual(beforeRun);
  });
  it.each(
    [
      ['a post of a followed actor', 'followed'],
      ['a post of a local actor', 'local'],
      ['a repost row', 'repost'],
      ['a row after the time limit', 'newer'],
      ['a deleted row', 'deleted'],
    ] as const,
  )('does not count %s', async (_label, key) => {
    const { fixture, kept } = build();
    const { notices } = await run('dry-run', fixture);
    expect(notices).toEqual(['IORI_NOTICE delete-unfollowed-posts mode=dry-run targets=5 federated=0']);
    expect(rows(fixture, `${dryRunSql(before)} AND t.timelineItemId = '${kept[key].timelineItemId}'`)).toEqual([
      { targets: 0, federated: 0 },
    ]);
  });
  it('counts the distinct posts with a federated item among the targets', async () => {
    const { fixture, seed, targets } = build();
    const relayId = seed.addRelay();
    seed.addFederatedItem(targets.u1a.postId, relayId, 1_000);
    seed.addFederatedItem(targets.u2a.postId, relayId, 1_000);
    fixture.sqlite.prepare(
      'INSERT INTO timeline_items(timelineItemId,type,actorId,postId,repostId,createdAt,deletedAt) SELECT ?,type,actorId,postId,repostId,createdAt,deletedAt FROM timeline_items WHERE timelineItemId = ?',
    ).run('duplicate-timeline-item', targets.u1a.timelineItemId!);
    const { notices } = await run('dry-run', fixture);
    expect(notices).toEqual(['IORI_NOTICE delete-unfollowed-posts mode=dry-run targets=6 federated=2']);
  });
  it('does not count a federated item whose home row is not a target', async () => {
    const { fixture, seed, kept } = build();
    const relayId = seed.addRelay();
    const keptPostIds = ids(kept.followed, kept.local, kept.newer, kept.deleted, kept.repost).map((id) =>
      String(
        (fixture.sqlite.prepare('SELECT postId FROM timeline_items WHERE timelineItemId = ?').get(id) as {
          postId: string;
        }).postId,
      )
    );
    for (const postId of keptPostIds) seed.addFederatedItem(postId, relayId, 1_000);
    const { notices } = await run('dry-run', fixture);
    expect(notices).toEqual(['IORI_NOTICE delete-unfollowed-posts mode=dry-run targets=5 federated=0']);
  });
});

describe('delete-unfollowed-posts apply on a SQLite fixture', () => {
  it('soft-deletes only the unfollowed actors\' posts up to the limit', async () => {
    const { fixture, targets, kept } = build();
    const { error, notices } = await run('apply', fixture);
    expect(error).toBeUndefined();
    expect(timelineIds(fixture, `deletedAt = ${now}`)).toEqual(
      ids(targets.u1a, targets.u1b, targets.u2a, targets.remoteFollowed, targets.boundary),
    );
    expect(timelineIds(fixture, 'deletedAt IS NULL')).toEqual(
      ids(kept.followed, kept.local, kept.newer, kept.repost),
    );
    expect(timelineIds(fixture, 'deletedAt = 3600')).toEqual(ids(kept.deleted));
    expect(notices).toEqual(['IORI_NOTICE delete-unfollowed-posts mode=apply deleted=5']);
  });
  it('leaves the rows outside the target unchanged and does not touch federated items', async () => {
    const { fixture, kept } = build();
    const keptIds = ids(kept.followed, kept.local, kept.newer, kept.deleted, kept.repost).map((id) => `'${id}'`)
      .join(',');
    const keptRows = () =>
      rows(fixture, `SELECT * FROM timeline_items WHERE timelineItemId IN (${keptIds}) ORDER BY 1`);
    const beforeRun = { kept: keptRows(), federated: snapshot(fixture).federated };
    await run('apply', fixture);
    expect(keptRows()).toEqual(beforeRun.kept);
    expect(snapshot(fixture).federated).toEqual(beforeRun.federated);
    expect(count(fixture, 'domain_events', 'eventName <> \'timelineItem.deleted\'')).toBe(0);
  });
  it('writes one timelineItem.deleted event per target with the same shape as the real store', async () => {
    const actual = build();
    await run('apply', actual.fixture);
    const events = rows(actual.fixture, 'SELECT * FROM domain_events ORDER BY aggregateId');
    const deletedIds = timelineIds(actual.fixture, `deletedAt = ${now}`);
    expect(events).toHaveLength(5);
    expect(events.map((event) => event.aggregateId)).toEqual(
      deletedIds.map((id) => JSON.stringify({ timelineItemId: id })).sort(),
    );
    for (const event of events) {
      expect(event.eventId).toMatch(uuidV4);
      expect(event.eventPayload).toBe(event.aggregateId);
      expect(event).toMatchObject({
        aggregateName: 'timelineItem',
        aggregateState: null,
        eventName: 'timelineItem.deleted',
        occurredAt: now,
      });
    }
    expect(new Set(events.map((event) => event.eventId)).size).toBe(5);

    const expected = build();
    const deletedStore = createD1TimelineItemDeletedStore(expected.fixture.db);
    for (const id of deletedIds) {
      await deletedStore.store(TimelineItem.deleteTimelineItem(TimelineItemId.orThrow(id), Instant.orThrow(now)));
    }
    const normalize = (fixture: Fixture) => ({
      timelineItems: rows(fixture, 'SELECT * FROM timeline_items ORDER BY timelineItemId'),
      events: rows(
        fixture,
        'SELECT aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt, typeof(aggregateState) AS stateType, typeof(occurredAt) AS occurredType FROM domain_events ORDER BY aggregateId',
      ),
    });
    expect(normalize(actual.fixture).events).toEqual(normalize(expected.fixture).events);
    expect(normalize(actual.fixture).timelineItems.map((item) => item.deletedAt)).toEqual(
      normalize(expected.fixture).timelineItems.map((item) => item.deletedAt),
    );
  });
  it('does not add anything when run a second time', async () => {
    const { fixture } = build();
    await run('apply', fixture);
    const afterFirst = snapshot(fixture);
    const second = await run('apply', fixture, {}, { at: now + 1 });
    expect(second.error).toBeUndefined();
    expect(snapshot(fixture)).toEqual(afterFirst);
    expect(second.notices).toEqual(['IORI_NOTICE delete-unfollowed-posts mode=apply deleted=0']);
    expect(count(fixture, 'domain_events')).toBe(5);
    const dry = await run('dry-run', fixture, {}, { at: now + 2 });
    expect(dry.notices).toEqual(['IORI_NOTICE delete-unfollowed-posts mode=dry-run targets=0 federated=0']);
  });
  it('soft-deletes a row whose event already exists without doubling the event', async () => {
    const complete = build();
    await run('apply', complete.fixture);
    const partial = build();
    const [insertEvents] = applySql({ beforeMs: before, now });
    partial.fixture.sqlite.exec(insertEvents);
    expect(count(partial.fixture, 'domain_events')).toBe(5);
    expect(count(partial.fixture, 'timeline_items', `deletedAt = ${now + 5}`)).toBe(0);
    const resumed = await run('apply', partial.fixture, {}, { at: now + 5 });
    expect(resumed.error).toBeUndefined();
    expect(count(partial.fixture, 'domain_events')).toBe(5);
    expect(count(partial.fixture, 'timeline_items', `deletedAt = ${now + 5}`)).toBe(5);
    expect(resumed.notices).toEqual(['IORI_NOTICE delete-unfollowed-posts mode=apply deleted=5']);
    const deletedEvents = (fixture: Fixture) =>
      rows(
        fixture,
        'SELECT aggregateId FROM domain_events WHERE eventName = \'timelineItem.deleted\' ORDER BY aggregateId',
      );
    expect(deletedEvents(partial.fixture)).toEqual(deletedEvents(complete.fixture));
  });
  it('fails with the query stage and prints no notice when the apply request is rejected', async () => {
    const { fixture } = build();
    const { fetchRequest } = fakeFetch(fixture);
    const rejected =
      (async (url: URL, init: RequestInit) =>
        init.body !== undefined && String(init.body).includes('INSERT INTO')
          ? json(null, 500)
          : fetchRequest(url, init)) as typeof fetch;
    const notices: string[] = [];
    let error: unknown;
    try {
      await deleteUnfollowedPosts({
        env: env(),
        mode: 'apply',
        fetchRequest: rejected,
        notice: (line) => notices.push(line),
        now,
      });
    } catch (caught) {
      error = caught;
    }
    expect(notices).toEqual([]);
    expect(deleteFailureLines(error)).toEqual([diag('delete-posts-query', 'd1-http-500')]);
    expect(count(fixture, 'timeline_items', `deletedAt = ${now}`)).toBe(0);
  });
});
