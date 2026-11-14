import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../src/adaptor/d1/__tests__/sqliteFixture.ts';
import {
  ARCHIVE_AGE_MS,
  dailySql,
  domainEventsStats,
  eventNameSql,
  statsFailureLines,
  statsStatements,
  summarySql,
} from '../domain-events-stats.mjs';

const accountId = 'b'.repeat(32);
const token = 'api-token-value-for-fixture-0123456789';
const generation = 'prd20261102a';
const databaseName = `iori-production-${generation}`;
const databaseUuid = '11111111-1111-4111-8111-111111111111';
const databasePath = `/accounts/${accountId}/d1/database/${databaseUuid}`;
const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 5, 12, 0, 0);
const env = (overrides: Record<string, string | undefined> = {}) => ({
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: generation,
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: token,
  ...overrides,
});
const diag = (stage: string, reason: string) =>
  `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`;
const json = (result: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, errors: [], messages: [], result }), { status });

type Fixture = ReturnType<typeof createSqliteD1Fixture>;
let sequence = 0;
const addEvent = (
  fixture: Fixture,
  occurredAt: number,
  eventName: string,
  options: { state?: string | null; payload?: string | null } = {},
) => {
  sequence += 1;
  fixture.sqlite.prepare(
    'INSERT INTO domain_events (eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    `event-${sequence}`,
    `{"id":"${sequence}"}`,
    'aggregate',
    options.state ?? null,
    eventName,
    options.payload ?? null,
    occurredAt,
  );
};
const addActor = (fixture: Fixture, actorId: string) =>
  fixture.sqlite.prepare('INSERT INTO actors (actorId, uri, inboxUrl, type) VALUES (?, ?, ?, ?)').run(
    actorId,
    `https://example.com/${actorId}`,
    `https://example.com/${actorId}/inbox`,
    'Person',
  );
const addActorEvent = (fixture: Fixture, aggregateId: string, occurredAt: number, eventName: string) => {
  sequence += 1;
  fixture.sqlite.prepare(
    'INSERT INTO domain_events (eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(`event-${sequence}`, aggregateId, 'actor', null, eventName, null, occurredAt);
};
const build = () => {
  const fixture = createSqliteD1Fixture();
  addEvent(fixture, now - 40 * DAY, 'post.created', { payload: 'x'.repeat(100) });
  addEvent(fixture, now - 8 * DAY, 'post.created', { state: 'y'.repeat(50), payload: 'x'.repeat(200) });
  addEvent(fixture, now - ARCHIVE_AGE_MS - 1, 'post.deleted');
  addEvent(fixture, now - ARCHIVE_AGE_MS, 'post.deleted');
  addEvent(fixture, now - 2 * DAY, 'post.created');
  addEvent(fixture, now - 1000, 'timelineItem.deleted');
  addEvent(fixture, now - 29 * DAY, 'timelineItem.deleted');
  return fixture;
};

type Call = { method: string; path: string; sql?: string };
const fakeFetch = (fixture: Fixture, options: { names?: string[] } = {}) => {
  const calls: Call[] = [];
  const fetchRequest = async (url: URL, init: RequestInit) => {
    const path = url.pathname.replace('/client/v4', '');
    const method = String(init.method);
    const sql = init.body === undefined ? undefined : (JSON.parse(String(init.body)) as { sql: string }).sql;
    calls.push({ method, path, sql });
    if (method === 'GET' && path === `/accounts/${accountId}/d1/database`) {
      return json((options.names ?? [databaseName, 'iori']).map((name) => ({ name, uuid: databaseUuid })));
    }
    if (method === 'GET' && path === databasePath) return json({ name: databaseName, uuid: databaseUuid });
    if (method === 'POST' && path === `${databasePath}/query`) {
      return json(
        sql!.split(';\n').map((statement) => ({
          results: fixture.sqlite.prepare(statement).all(),
          success: true,
          meta: {},
        })),
      );
    }
    return json(null, 404);
  };
  return { calls, fetchRequest: fetchRequest as unknown as typeof fetch };
};
const run = async (
  fixture: Fixture,
  overrides: Record<string, string | undefined> = {},
  options: { names?: string[] } = {},
) => {
  const { calls, fetchRequest } = fakeFetch(fixture, options);
  const notices: string[] = [];
  const outputs: string[] = [];
  let error: unknown;
  try {
    await domainEventsStats({
      env: env(overrides),
      fetchRequest,
      notice: (line) => notices.push(line),
      output: (text) => outputs.push(text),
      now,
    });
  } catch (caught) {
    error = caught;
  }
  const queries = calls.filter((call) => call.method === 'POST').map((call) => call.sql!);
  return { calls, queries, notices, outputs, error };
};

describe('domain-events-stats SQL', () => {
  it('sends only SELECT statements', () => {
    const statements = statsStatements(now);
    expect(statements).toEqual([summarySql(now), dailySql(now), eventNameSql()]);
    for (const sql of statements) {
      expect(sql).toMatch(/^SELECT /);
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH|VACUUM)\b/i);
      expect(sql).not.toContain(';');
    }
  });
  it('sends only SELECT statements to D1 and changes nothing', async () => {
    const fixture = build();
    const rowsBefore = fixture.sqlite.prepare('SELECT * FROM domain_events ORDER BY eventId').all();
    const { queries, error } = await run(fixture);
    expect(error).toBeUndefined();
    expect(queries).toHaveLength(1);
    for (const statement of queries[0].split(';\n')) {
      expect(statement).toMatch(/^SELECT /);
      expect(statement).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH|VACUUM)\b/i);
    }
    expect(fixture.sqlite.prepare('SELECT * FROM domain_events ORDER BY eventId').all()).toEqual(rowsBefore);
  });
});

describe('domain-events-stats result', () => {
  it('counts the rows, the oldest and newest times, and the rows older than 7 days', async () => {
    const { outputs, error } = await run(build());
    expect(error).toBeUndefined();
    const stats = JSON.parse(outputs[0]);
    expect(stats).toMatchObject({
      generatedAt: new Date(now).toISOString(),
      total: 7,
      oldestOccurredAt: new Date(now - 40 * DAY).toISOString(),
      newestOccurredAt: new Date(now - 1000).toISOString(),
      olderThanArchiveAge: {
        days: 7,
        cutoffOccurredAt: new Date(now - ARCHIVE_AGE_MS).toISOString(),
        count: 4,
      },
    });
  });
  it('counts the rows per UTC day for the last 30 days only', async () => {
    const { outputs } = await run(build());
    const { dailyCounts } = JSON.parse(outputs[0]);
    const day = (offset: number) => new Date(now - offset).toISOString().slice(0, 10);
    expect(dailyCounts).toEqual([
      { day: day(29 * DAY), count: 1 },
      { day: day(8 * DAY), count: 1 },
      { day: day(ARCHIVE_AGE_MS), count: 2 },
      { day: day(2 * DAY), count: 1 },
      { day: day(1000), count: 1 },
    ].sort((a, b) => a.day.localeCompare(b.day)));
    expect(dailyCounts.map((item: { day: string }) => item.day)).not.toContain(day(40 * DAY));
  });
  it('counts the actors whose earliest event is not actor.created or that have no actor.created', async () => {
    const fixture = createSqliteD1Fixture();
    for (const actorId of ['older', 'older-raw', 'clean', 'clean-raw', 'only-other', 'no-events']) {
      addActor(fixture, actorId);
    }
    addActorEvent(fixture, '"older"', now - 20 * DAY, 'post.created');
    addActorEvent(fixture, '"older"', now - 10 * DAY, 'actor.created');
    addActorEvent(fixture, 'older-raw', now - 20 * DAY, 'post.created');
    addActorEvent(fixture, 'older-raw', now - 10 * DAY, 'actor.created');
    addActorEvent(fixture, '"clean"', now - 10 * DAY, 'actor.created');
    addActorEvent(fixture, '"clean"', now - 5 * DAY, 'post.created');
    addActorEvent(fixture, 'clean-raw', now - 10 * DAY, 'actor.created');
    addActorEvent(fixture, 'clean-raw', now - 5 * DAY, 'post.created');
    addActorEvent(fixture, '"only-other"', now - 5 * DAY, 'post.created');
    const { outputs, notices, error } = await run(fixture);
    expect(error).toBeUndefined();
    expect(JSON.parse(outputs[0]).createdAtSkewActors).toBe(4);
    expect(notices[0]).toMatch(/ max_bytes=\d+ created_at_skew_actors=4$/);
  });
});

describe('domain-events-stats input and database checks', () => {
  it.each([
    ['staging', { IORI_ENVIRONMENT: 'staging' }, 'config-invalid'],
    ['without a generation', { IORI_GENERATION: '' }, 'config-invalid'],
    ['with a bad account id', { CLOUDFLARE_ACCOUNT_ID: 'not-hex' }, 'config-invalid'],
    ['without an account id', { CLOUDFLARE_ACCOUNT_ID: '' }, 'credentials-missing'],
    ['without a token', { CLOUDFLARE_API_TOKEN: '' }, 'credentials-missing'],
  ])('fails without any request when the input is %s', async (_label, overrides, reason) => {
    const { calls, error, outputs } = await run(createSqliteD1Fixture(), overrides);
    expect(calls).toEqual([]);
    expect(outputs).toEqual([]);
    expect(statsFailureLines(error)).toEqual([diag('events-stats', reason)]);
  });
  it.each([
    ['is missing', [], 'resource-missing'],
    ['is listed twice', [databaseName, databaseName], 'resource-ambiguous'],
  ])('fails without a query when the D1 name %s', async (_label, names, reason) => {
    const { calls, error } = await run(createSqliteD1Fixture(), {}, { names });
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    expect(statsFailureLines(error)).toEqual([diag('events-stats-resolve', reason)]);
  });
  it('keeps the token, the account id and ids out of the failure lines', async () => {
    const { error } = await run(createSqliteD1Fixture(), {}, { names: [] });
    for (const line of statsFailureLines(error)) {
      expect(line).not.toContain(token);
      expect(line).not.toContain(accountId);
      expect(line).not.toContain(databaseUuid);
    }
  });
});
