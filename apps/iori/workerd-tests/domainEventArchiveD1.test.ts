import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1ArchivableDomainEventsResolver } from '../src/adaptor/d1/domainEvent/archivableDomainEventsResolver.ts';
import { createD1ArchivedDomainEventsDeleter } from '../src/adaptor/d1/domainEvent/archivedDomainEventsDeleter.ts';
import type { ArchivedDomainEvent } from '../src/domain/domainEvent/domainEventArchive.ts';
import { Instant } from '../src/domain/instant/instant.ts';

const BYTE_BUDGET = 16 * 1024 * 1024;
const CUTOFF = Instant.orThrow(Date.UTC(2020, 0, 10));
const at = (day: number, hour = 0, minute = 0) => Date.UTC(2020, 0, day, hour, minute);

const db = createD1Db(env.DB);
const resolver = createD1ArchivableDomainEventsResolver(db);
const deleter = createD1ArchivedDomainEventsDeleter(db);

const addEvent = (
  eventId: string,
  occurredAt: number,
  options: Readonly<{ eventName?: string; payload?: string | null }> = {},
) =>
  env.DB.prepare(
    'INSERT INTO domain_events(eventId,aggregateId,aggregateName,aggregateState,eventName,eventPayload,occurredAt) VALUES (?,?,?,?,?,?,?)',
  ).bind(eventId, 'agg', 'post', null, options.eventName ?? 'post.created', options.payload ?? null, occurredAt).run();

const remainingIds = async () =>
  (await env.DB.prepare('SELECT eventId FROM domain_events WHERE occurredAt < ? ORDER BY occurredAt, eventId').bind(
    Date.UTC(2021, 0, 1),
  ).all<{ eventId: string }>()).results.map((row) => row.eventId);

const resolveIds = async (limit: number, byteBudget = BYTE_BUDGET, cutoff = CUTOFF) =>
  (await resolver.resolve({ cutoff, limit, byteBudget })).val;

const rangeOf = (events: readonly ArchivedDomainEvent[]) => ({
  first: events[0]!,
  last: events.at(-1)!,
  cutoff: CUTOFF,
  count: events.length,
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM domain_events WHERE occurredAt < ?').bind(Date.UTC(2021, 0, 1)).run();
});

describe('archive resolver and deleter on workerd D1', () => {
  it('同じ occurredAt で eventId が違う行がバッチの切れ目をまたいでも、漏れも重複もなく消える', async () => {
    for (const id of ['e1', 'e2', 'e3', 'e4', 'e5']) await addEvent(id, at(1, 1));

    const first = await resolveIds(3);
    expect(first.map((event) => event.eventId)).toEqual(['e1', 'e2', 'e3']);
    expect((await deleter.deleteRange(rangeOf(first))).val).toBe(3);
    expect(await remainingIds()).toEqual(['e4', 'e5']);

    const second = await resolveIds(3);
    expect(second.map((event) => event.eventId)).toEqual(['e4', 'e5']);
    expect((await deleter.deleteRange(rangeOf(second))).val).toBe(2);
    expect(await remainingIds()).toEqual([]);
  });

  it('範囲の途中にある actor.created は読まず、消さない', async () => {
    await addEvent('a1', at(1, 1));
    await addEvent('actor', at(1, 2), { eventName: 'actor.created' });
    await addEvent('a2', at(1, 3));

    const events = await resolveIds(3);

    expect(events.map((event) => event.eventId)).toEqual(['a1', 'a2']);
    expect((await deleter.deleteRange(rangeOf(events))).val).toBe(2);
    expect(await remainingIds()).toEqual(['actor']);
  });

  it('cutoff と同じ時刻の行は読まず、消さない', async () => {
    await addEvent('before', CUTOFF - 1);
    await addEvent('same', CUTOFF);
    await addEvent('after', CUTOFF + 1);

    const events = await resolveIds(10);

    expect(events.map((event) => event.eventId)).toEqual(['before']);
    expect((await deleter.deleteRange({ ...rangeOf(events), last: events[0]! })).val).toBe(1);
    expect(await remainingIds()).toEqual(['same', 'after']);
  });

  it('バイトの予算を超える手前で区切り、先頭の1行は予算より大きくても返す', async () => {
    for (const id of ['b1', 'b2', 'b3', 'b4']) {
      await addEvent(id, at(1, Number(id.slice(1))), { payload: 'x'.repeat(100) });
    }

    expect((await resolveIds(10, 250)).map((event) => event.eventId)).toEqual(['b1', 'b2', 'b3']);
    expect((await resolveIds(10, 206)).map((event) => event.eventId)).toEqual(['b1', 'b2']);
    expect((await resolveIds(10, 1)).map((event) => event.eventId)).toEqual(['b1']);
    expect((await resolveIds(2, BYTE_BUDGET)).map((event) => event.eventId)).toEqual(['b1', 'b2']);
  });

  it('日本語を含む行は、文字数ではなく UTF-8 のバイト数で予算に数える', async () => {
    for (const id of ['j1', 'j2', 'j3', 'j4']) {
      await addEvent(id, at(1, Number(id.slice(1))), { payload: 'あ'.repeat(50) });
    }

    expect((await resolveIds(10, 300)).map((event) => event.eventId)).toEqual(['j1', 'j2']);
    expect((await resolveIds(10, 153)).map((event) => event.eventId)).toEqual(['j1']);
    expect((await resolveIds(10, 154)).map((event) => event.eventId)).toEqual(['j1', 'j2']);
  });

  it('期待する件数が範囲の中の件数と合わなければ、何も消さない', async () => {
    await addEvent('c1', at(1, 1));
    await addEvent('c2', at(1, 2));
    await addEvent('c3', at(1, 3));
    const events = await resolveIds(10);

    expect((await deleter.deleteRange({ ...rangeOf(events), first: events[0]!, last: events[2]!, count: 2 })).val)
      .toBe(0);
    expect(await remainingIds()).toEqual(['c1', 'c2', 'c3']);
    expect((await deleter.deleteRange(rangeOf(events))).val).toBe(3);
    expect(await remainingIds()).toEqual([]);
  });
});
