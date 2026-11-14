import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../src/adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../src/adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1FederatedTimelineItemCreatedStore } from '../../src/adaptor/d1/federatedTimeline/federatedTimelineItemCreatedStore.ts';
import { createD1TimelineItemDeletedStore } from '../../src/adaptor/d1/timeline/timelineItemDeletedStore.ts';
import { FederatedTimelineItem } from '../../src/domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../src/domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../src/domain/instant/instant.ts';
import { PostId } from '../../src/domain/post/postId.ts';
import { RelayId } from '../../src/domain/relay/relayId.ts';
import { TimelineItem } from '../../src/domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../src/domain/timeline/timelineItemId.ts';
import {
  applySql,
  moveFailureLines,
  moveUnfollowedReposts,
  RELAY_ACTOR_URI,
  relaySql,
} from '../move-unfollowed-reposts.mjs';

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

const build = ({ relayStatus = 'accepted', withRelay = true } = {}) => {
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
  const post = (createdAt: number) => seed.addRemotePost(author, createdAt).postId;
  const [p1, p2, p3, p4, p5, p6, p7, p8, p9] = Array.from({ length: 9 }, (_, index) => post(100 + index));
  const otherRelayId = seed.addRelay();
  seed.addFederatedItem(p2, otherRelayId, 777);
  const reposts = {
    p1u1: seed.addRepost(unfollowed1.actorId, p1, 1_000),
    p1u2: seed.addRepost(unfollowed2.actorId, p1, 500),
    p2u1: seed.addRepost(unfollowed1.actorId, p2, 2_000),
    p3followed: seed.addRepost(followed.actorId, p3, 1_500),
    p4local: seed.addRepost(local.actorId, p4, 1_600),
    p5newer: seed.addRepost(unfollowed1.actorId, p5, before + 1),
    p6remoteFollowed: seed.addRepost(followedByRemoteOnly.actorId, p6, 3_000),
    p8deleted: seed.addRepost(unfollowed1.actorId, p8, 3_500),
    p9u2: seed.addRepost(unfollowed2.actorId, p9, 4_000),
    p9followed: seed.addRepost(followed.actorId, p9, 4_100),
    boundary: seed.addRepost(unfollowed2.actorId, p3, before),
  };
  const plainPost = seed.addRemotePost(unfollowed1, 4_500, { timeline: true });
  fixture.sqlite.prepare('UPDATE timeline_items SET deletedAt = 3600 WHERE timelineItemId = ?').run(
    reposts.p8deleted.timelineItemId!,
  );
  const relayId = '22222222-2222-4222-8222-222222222222';
  if (withRelay) {
    fixture.sqlite.prepare('INSERT INTO relays(relayId,inboxUrl,actorUri,status,createdAt) VALUES (?,?,?,?,?)').run(
      relayId,
      'https://relay.fedibird.com/inbox',
      RELAY_ACTOR_URI,
      relayStatus,
      1,
    );
  }
  return {
    fixture,
    seed,
    local,
    unfollowed1,
    relayId,
    otherRelayId,
    posts: { p1, p2, p3, p4, p5, p6, p7, p8, p9 },
    reposts,
    plainPost,
  };
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
    await moveUnfollowedReposts({
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

describe('move-unfollowed-reposts input checks', () => {
  it.each([
    ['empty', { IORI_REPOST_CREATED_BEFORE_MS: '' }],
    ['missing', { IORI_REPOST_CREATED_BEFORE_MS: undefined }],
    ['not digits', { IORI_REPOST_CREATED_BEFORE_MS: 'abc' }],
    ['a decimal', { IORI_REPOST_CREATED_BEFORE_MS: '1.5' }],
    ['negative', { IORI_REPOST_CREATED_BEFORE_MS: '-1' }],
    ['zero', { IORI_REPOST_CREATED_BEFORE_MS: '0' }],
    ['with spaces', { IORI_REPOST_CREATED_BEFORE_MS: ' 5000' }],
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
      expect(moveFailureLines(error)).toEqual([diag('move-reposts', 'config-invalid')]);
    }
  });
  it.each(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])(
    'fails without any request when %s is empty',
    async (name) => {
      const { fixture } = build();
      const { calls, error } = await run('apply', fixture, { [name]: '' });
      expect(calls).toEqual([]);
      expect(moveFailureLines(error)).toEqual([diag('move-reposts', 'credentials-missing')]);
    },
  );
});

describe('move-unfollowed-reposts relay and database checks', () => {
  it('fails before any write when the relay is not found', async () => {
    const { fixture } = build({ withRelay: false });
    const { queries, error } = await run('apply', fixture);
    expect(queries).toEqual([relaySql()]);
    expect(moveFailureLines(error)).toEqual([diag('move-reposts-resolve', 'resource-missing')]);
    expect(count(fixture, 'timeline_items', 'deletedAt IS NOT NULL')).toBe(1);
  });
  it.each(['pending', 'rejected', 'Accepted', ''])(
    'fails before any write when the relay status is %j',
    async (status) => {
      for (const mode of ['dry-run', 'apply'] as const) {
        const { fixture } = build({ relayStatus: status });
        const { queries, error } = await run(mode, fixture);
        expect(queries).toEqual([relaySql()]);
        expect(moveFailureLines(error)).toEqual([diag('move-reposts-resolve', 'state-mismatch')]);
      }
    },
  );
  it.each([
    ['is missing', [], 'resource-missing'],
    ['is listed twice', [databaseName, databaseName], 'resource-ambiguous'],
  ])('fails without a query when the D1 name %s', async (_label, names, reason) => {
    const { fixture } = build();
    const { calls, error } = await run('apply', fixture, {}, { names });
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    expect(moveFailureLines(error)).toEqual([diag('move-reposts-resolve', reason)]);
  });
  it('fails without a query when the listed id is not a UUID', async () => {
    const { fixture } = build();
    const { calls, error } = await run('apply', fixture, {}, { uuid: '../../x' });
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    expect(moveFailureLines(error)).toEqual([diag('move-reposts-resolve', 'result-invalid')]);
  });
});

describe('move-unfollowed-reposts SQL', () => {
  it('sends only SELECT statements for a dry-run and changes nothing', async () => {
    const { fixture } = build();
    const beforeRun = snapshot(fixture);
    const { queries, notices, error } = await run('dry-run', fixture);
    expect(error).toBeUndefined();
    expect(queries).toHaveLength(2);
    expect(queries[0]).toBe(relaySql());
    for (const sql of queries) {
      expect(sql).toMatch(/^SELECT /);
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH)\b/i);
      expect(sql).not.toContain(';');
    }
    expect(notices).toEqual([
      'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=6 posts=5 already_federated=1 to_create=4 missing_posts=0',
    ]);
    expect(snapshot(fixture)).toEqual(beforeRun);
  });
});

describe('move-unfollowed-reposts apply on a SQLite fixture', () => {
  const ids = (...items: Array<{ timelineItemId?: string }>) => items.map((item) => item.timelineItemId!).sort();
  const timelineIds = (fixture: Fixture, where: string) =>
    rows(fixture, `SELECT timelineItemId FROM timeline_items WHERE ${where}`).map((row) => String(row.timelineItemId))
      .sort();

  it('soft-deletes only the unfollowed actors\' reposts up to the limit', async () => {
    const { fixture, reposts, plainPost } = build();
    const { error, notices } = await run('apply', fixture);
    expect(error).toBeUndefined();
    expect(timelineIds(fixture, `deletedAt = ${now}`)).toEqual(
      ids(reposts.p1u1, reposts.p1u2, reposts.p2u1, reposts.p6remoteFollowed, reposts.p9u2, reposts.boundary),
    );
    expect(timelineIds(fixture, 'deletedAt IS NULL')).toEqual(
      ids(reposts.p3followed, reposts.p4local, reposts.p5newer, reposts.p9followed, plainPost),
    );
    expect(timelineIds(fixture, 'deletedAt = 3600')).toEqual(ids(reposts.p8deleted));
    expect(notices).toEqual(['IORI_NOTICE move-unfollowed-reposts mode=apply created=4 deleted=6']);
  });
  it('creates one federated item per post, and none for a post that already has one', async () => {
    const { fixture, relayId, otherRelayId, posts } = build();
    await run('apply', fixture);
    const items = rows(
      fixture,
      'SELECT federatedTimelineItemId, postId, relayId, receivedAt FROM federated_timeline_items ORDER BY postId',
    );
    expect(items.filter((item) => item.relayId === relayId).map((item) => [item.postId, item.receivedAt]).sort())
      .toEqual([[posts.p1, 500], [posts.p3, 5_000], [posts.p6, 3_000], [posts.p9, 4_000]].sort());
    expect(items.filter((item) => item.postId === posts.p2)).toEqual([
      expect.objectContaining({ relayId: otherRelayId, receivedAt: 777 }),
    ]);
    expect(items).toHaveLength(5);
    for (const item of items.filter((item) => item.relayId === relayId)) {
      expect(item.federatedTimelineItemId).toMatch(uuidV4);
    }
  });
  it('writes the same domain events and rows as the real stores', async () => {
    const actual = build();
    await run('apply', actual.fixture);
    const expected = build();
    const created = rows(
      actual.fixture,
      `SELECT federatedTimelineItemId, postId, relayId, receivedAt FROM federated_timeline_items WHERE relayId = '${actual.relayId}'`,
    );
    const createdStore = createD1FederatedTimelineItemCreatedStore(expected.fixture.db);
    for (const item of created) {
      await createdStore.store(FederatedTimelineItem.createFederatedTimelineItem({
        federatedTimelineItemId: FederatedTimelineItemId.orThrow(String(item.federatedTimelineItemId)),
        postId: PostId.orThrow(String(item.postId)),
        relayId: RelayId.orThrow(String(item.relayId)),
        receivedAt: Number(item.receivedAt),
      }, Instant.orThrow(now)));
    }
    const deletedStore = createD1TimelineItemDeletedStore(expected.fixture.db);
    const deletedIds = rows(actual.fixture, `SELECT timelineItemId FROM timeline_items WHERE deletedAt = ${now}`);
    for (const row of deletedIds) {
      await deletedStore.store(
        TimelineItem.deleteTimelineItem(TimelineItemId.orThrow(String(row.timelineItemId)), Instant.orThrow(now)),
      );
    }
    const normalize = (fixture: Fixture) => ({
      timelineItems: rows(fixture, 'SELECT * FROM timeline_items ORDER BY timelineItemId'),
      federated: rows(fixture, 'SELECT * FROM federated_timeline_items ORDER BY federatedTimelineItemId'),
      events: rows(
        fixture,
        'SELECT aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt, typeof(aggregateState) AS stateType, typeof(occurredAt) AS occurredType FROM domain_events ORDER BY eventName, aggregateId',
      ),
    });
    expect(normalize(actual.fixture)).toEqual(normalize(expected.fixture));
    const events = normalize(actual.fixture).events;
    expect(events.filter((event) => event.eventName === 'federatedTimelineItem.created')).toHaveLength(4);
    expect(events.filter((event) => event.eventName === 'timelineItem.deleted')).toHaveLength(6);
    const first = events.find((event) => event.eventName === 'federatedTimelineItem.created')!;
    expect(JSON.parse(String(first.aggregateState))).toEqual(JSON.parse(String(first.eventPayload)));
    expect(typeof JSON.parse(String(first.eventPayload)).receivedAt).toBe('number');
    expect(events.find((event) => event.eventName === 'timelineItem.deleted')).toMatchObject({
      aggregateName: 'timelineItem',
      aggregateState: null,
    });
  });
  it('does not add anything when run a second time', async () => {
    const { fixture } = build();
    await run('apply', fixture);
    const afterFirst = snapshot(fixture);
    const second = await run('apply', fixture, {}, { at: now + 1 });
    expect(second.error).toBeUndefined();
    expect(snapshot(fixture)).toEqual(afterFirst);
    expect(second.notices).toEqual(['IORI_NOTICE move-unfollowed-reposts mode=apply created=0 deleted=0']);
    const dry = await run('dry-run', fixture, {}, { at: now + 2 });
    expect(dry.notices).toEqual([
      'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=0 posts=0 already_federated=0 to_create=0 missing_posts=0',
    ]);
  });
  it('does not double the events when it runs again after stopping before the soft delete', async () => {
    const complete = build();
    await run('apply', complete.fixture);
    const partial = build();
    const [insertItems, createdEvents, deletedEventsSql] = applySql({
      relayId: partial.relayId,
      beforeMs: before,
      now,
    });
    for (const sql of [insertItems, createdEvents, deletedEventsSql]) partial.fixture.sqlite.exec(sql);
    expect(count(partial.fixture, 'domain_events')).toBe(10);
    const resumed = await run('apply', partial.fixture, {}, { at: now + 5 });
    expect(resumed.error).toBeUndefined();
    expect(count(partial.fixture, 'domain_events')).toBe(10);
    expect(count(partial.fixture, 'federated_timeline_items')).toBe(5);
    expect(count(partial.fixture, 'timeline_items', `deletedAt = ${now + 5}`)).toBe(6);
    expect(resumed.notices).toEqual(['IORI_NOTICE move-unfollowed-reposts mode=apply created=0 deleted=6']);
    const deletedEvents = (fixture: Fixture) =>
      rows(
        fixture,
        'SELECT aggregateId FROM domain_events WHERE eventName = \'timelineItem.deleted\' ORDER BY aggregateId',
      );
    expect(deletedEvents(partial.fixture)).toEqual(deletedEvents(complete.fixture));
  });
  it('neither moves nor soft-deletes a repost of a local post by an unfollowed remote actor', async () => {
    const { fixture, seed, local, unfollowed1 } = build();
    const localPost = seed.addLocalPost(local, 200, { timeline: false });
    const boost = seed.addRepost(unfollowed1.actorId, localPost.postId, 1_200);
    const dry = await run('dry-run', fixture);
    expect(dry.notices).toEqual([
      'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=6 posts=5 already_federated=1 to_create=4 missing_posts=0',
    ]);
    const { notices, error } = await run('apply', fixture);
    expect(error).toBeUndefined();
    expect(notices).toEqual(['IORI_NOTICE move-unfollowed-reposts mode=apply created=4 deleted=6']);
    expect(timelineIds(fixture, `deletedAt IS NULL AND postId = '${localPost.postId}'`)).toEqual(ids(boost));
    expect(count(fixture, 'federated_timeline_items', `postId = '${localPost.postId}'`)).toBe(0);
    expect(count(fixture, 'domain_events', `aggregateId LIKE '%${boost.timelineItemId}%'`)).toBe(0);
  });
  it('soft-deletes a repost whose post is missing without creating a federated item', async () => {
    const { fixture, seed, unfollowed1, relayId } = build();
    const author = seed.addRemoteActor('missing-author');
    const missing = seed.addRemotePost(author, 300);
    const repost = seed.addRepost(unfollowed1.actorId, missing.postId, 1_300);
    fixture.sqlite.exec('PRAGMA foreign_keys=OFF');
    fixture.sqlite.prepare('DELETE FROM remote_posts WHERE postId = ?').run(missing.postId);
    fixture.sqlite.prepare('DELETE FROM posts WHERE postId = ?').run(missing.postId);
    fixture.sqlite.exec('PRAGMA foreign_keys=ON');
    const dry = await run('dry-run', fixture);
    expect(dry.notices).toEqual([
      'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=7 posts=6 already_federated=1 to_create=4 missing_posts=1',
    ]);
    const { notices, error } = await run('apply', fixture);
    expect(error).toBeUndefined();
    expect(notices).toEqual(['IORI_NOTICE move-unfollowed-reposts mode=apply created=4 deleted=7']);
    expect(timelineIds(fixture, `deletedAt = ${now} AND postId = '${missing.postId}'`)).toEqual(ids(repost));
    expect(count(fixture, 'federated_timeline_items', `postId = '${missing.postId}'`)).toBe(0);
    expect(count(fixture, 'federated_timeline_items', `relayId = '${relayId}'`)).toBe(4);
  });
  it.each([1, 2, 3])('ends in the same state when it runs again after only the first %i statements', (done) => {
    const { fixture, relayId } = build();
    const statements = applySql({ relayId, beforeMs: before, now });
    for (const sql of statements.slice(0, done)) fixture.sqlite.exec(sql);
    for (const sql of statements) fixture.sqlite.exec(sql);
    expect(count(fixture, 'federated_timeline_items')).toBe(5);
    expect(count(fixture, 'federated_timeline_items', `relayId = '${relayId}'`)).toBe(4);
    expect(rows(fixture, `SELECT DISTINCT postId FROM federated_timeline_items WHERE relayId = '${relayId}'`))
      .toHaveLength(4);
    expect(count(fixture, 'domain_events', 'eventName = \'federatedTimelineItem.created\'')).toBe(4);
    expect(
      rows(
        fixture,
        'SELECT DISTINCT aggregateId FROM domain_events WHERE eventName = \'federatedTimelineItem.created\'',
      ),
    )
      .toHaveLength(4);
    expect(count(fixture, 'domain_events', 'eventName = \'timelineItem.deleted\'')).toBe(6);
    expect(rows(fixture, 'SELECT DISTINCT aggregateId FROM domain_events WHERE eventName = \'timelineItem.deleted\''))
      .toHaveLength(6);
    expect(count(fixture, 'timeline_items', `deletedAt = ${now}`)).toBe(6);
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
      await moveUnfollowedReposts({
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
    expect(moveFailureLines(error)).toEqual([diag('move-reposts-query', 'd1-http-500')]);
    expect(count(fixture, 'timeline_items', `deletedAt = ${now}`)).toBe(0);
  });
});
