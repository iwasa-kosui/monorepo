import { RA } from '@iwasa-kosui/result';
import { parquetReadObjects } from 'hyparquet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sha256Hex } from '../../adaptor/crypto/sha256Hex.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1ArchivableDomainEventsResolver } from '../../adaptor/d1/domainEvent/archivableDomainEventsResolver.ts';
import { createD1ArchivedDomainEventsDeleter } from '../../adaptor/d1/domainEvent/archivedDomainEventsDeleter.ts';
import { createR2DomainEventArchiveWriter } from '../../adaptor/r2/domainEventArchiveWriter.ts';
import {
  ARCHIVE_REDACTED_EVENT_NAMES,
  type ArchivedDomainEvent,
  type ArchivedDomainEventsDeleter,
  DomainEventArchiveWriteError,
  type DomainEventArchiveWriter,
} from '../../domain/domainEvent/domainEventArchive.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { archiveDomainEventsTask } from '../../scheduled/eventArchiveTasks.ts';
import { ArchiveDomainEventsUseCase } from '../archiveDomainEvents.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 19, 0));
const at = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour, minute);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const setup = (
  options: Readonly<{ batchSize?: number; now?: () => Instant; byteBudget?: number; maxBatches?: number }> = {},
) => {
  const fixture = createSqliteD1Fixture();
  const { sqlite } = fixture;
  const addEvent = (
    eventId: string,
    occurredAt: number,
    eventName = 'post.created',
    aggregateState: string | null = '{"a":1}',
    eventPayload: string | null = '{"b":2}',
  ) => {
    sqlite.prepare(
      'INSERT INTO domain_events(eventId,aggregateId,aggregateName,aggregateState,eventName,eventPayload,occurredAt) VALUES (?,?,?,?,?,?,?)',
    ).run(eventId, `"agg-${eventId}"`, 'post', aggregateState, eventName, eventPayload, occurredAt);
  };
  const remainingIds = () =>
    (sqlite.prepare('SELECT eventId FROM domain_events ORDER BY occurredAt, eventId').all() as { eventId: string }[])
      .map((row) => row.eventId);
  const resolver = createD1ArchivableDomainEventsResolver(fixture.db);
  const realDeleter = createD1ArchivedDomainEventsDeleter(fixture.db);
  const written: { key: string; events: readonly ArchivedDomainEvent[] }[] = [];
  const recordingWriter: DomainEventArchiveWriter = {
    write: async (input) => {
      written.push(input);
      return RA.ok(undefined);
    },
  };
  const create = (
    overrides: Readonly<{ writer?: DomainEventArchiveWriter; deleter?: ArchivedDomainEventsDeleter }> = {},
  ) =>
    ArchiveDomainEventsUseCase.create({
      archivableDomainEventsResolver: resolver,
      domainEventArchiveWriter: overrides.writer ?? recordingWriter,
      archivedDomainEventsDeleter: overrides.deleter ?? realDeleter,
      aggregateIdHasher: sha256Hex,
      now: options.now ?? (() => NOW),
      batchSize: options.batchSize,
      byteBudget: options.byteBudget,
      maxBatches: options.maxBatches,
    });
  return { sqlite, addEvent, remainingIds, written, realDeleter, create } as const;
};

describe('ArchiveDomainEventsUseCase', () => {
  it('UTC の日をまたがず、最大件数ごとに分け、actor.created と締め切り以降の行は残す', async () => {
    const { addEvent, remainingIds, written, create } = setup({ batchSize: 3 });
    addEvent('a1', at(20, 1));
    addEvent('a2', at(20, 2));
    addEvent('a3', at(20, 3));
    addEvent('actor', at(20, 4), 'actor.created');
    addEvent('a4', at(20, 23, 59));
    addEvent('b1', at(21, 0));
    addEvent('b2', at(21, 5));
    addEvent('recent', Date.UTC(2026, 10, 1));

    const result = await create().run();

    expect(result).toMatchObject({ ok: true, val: { archived: 6, objects: 3, stoppedBy: 'drained' } });
    expect(written.map((batch) => batch.events.map((event) => event.eventId))).toEqual([
      ['a1', 'a2', 'a3'],
      ['a4'],
      ['b1', 'b2'],
    ]);
    expect(written.map((batch) => batch.key)).toEqual([
      `domain-events/v1/year=2026/month=10/day=20/${at(20, 1)}-a1.parquet`,
      `domain-events/v1/year=2026/month=10/day=20/${at(20, 23, 59)}-a4.parquet`,
      `domain-events/v1/year=2026/month=10/day=21/${at(21, 0)}-b1.parquet`,
    ]);
    expect(remainingIds()).toEqual(['actor', 'recent']);
  });

  it('actor.created が範囲の途中にあっても消さない', async () => {
    const { addEvent, remainingIds, written, create } = setup();
    addEvent('a1', at(20, 1));
    addEvent('actor', at(20, 2), 'actor.created');
    addEvent('a2', at(20, 3));

    await create().run();

    expect(written[0]!.events.map((event) => event.eventId)).toEqual(['a1', 'a2']);
    expect(remainingIds()).toEqual(['actor']);
  });

  it('機微なイベントは aggregate_state と event_payload を NULL にして書き、行は消す', async () => {
    const { addEvent, remainingIds, written, create } = setup();
    ARCHIVE_REDACTED_EVENT_NAMES.forEach((name, index) =>
      addEvent(`s${index}`, at(20, index), name, '{"secret":1}', '{"secret":2}')
    );
    addEvent('plain', at(20, 23), 'post.created', '{"a":1}', '{"b":2}');

    await create().run();

    const events = written.flatMap((batch) => batch.events);
    expect(events).toHaveLength(ARCHIVE_REDACTED_EVENT_NAMES.length + 1);
    for (const event of events.slice(0, -1)) {
      expect(event).toMatchObject({ aggregateState: null, eventPayload: null });
    }
    expect(events.at(-1)).toMatchObject({ aggregateState: '{"a":1}', eventPayload: '{"b":2}' });
    expect(remainingIds()).toEqual([]);
  });

  it('範囲の中に後から行が入ると何も消さず、行は D1 に残る', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { addEvent, remainingIds, create } = setup();
    addEvent('a1', at(20, 1));
    addEvent('a3', at(20, 3));
    const lateInsertingWriter: DomainEventArchiveWriter = {
      write: async () => {
        addEvent('a2', at(20, 2));
        return RA.ok(undefined);
      },
    };

    const result = await create({ writer: lateInsertingWriter }).run();

    expect(result).toMatchObject({ ok: true, val: { archived: 0, objects: 0, stoppedBy: 'deleteMismatch' } });
    expect(remainingIds()).toEqual(['a1', 'a2', 'a3']);
    expect(error).toHaveBeenCalledWith('iori domain events archive: deleted count differs from archived count.', {
      count: 2,
      deleted: 0,
      key: `domain-events/v1/year=2026/month=10/day=20/${at(20, 1)}-a1.parquet`,
    });
  });

  it('バイトの予算を超える手前でバッチを区切る', async () => {
    const { addEvent, remainingIds, written, create } = setup({ byteBudget: 200 });
    for (const [index, id] of ['a1', 'a2', 'a3', 'a4', 'a5'].entries()) {
      addEvent(id, at(20, index + 1), 'post.created', null, 'x'.repeat(100));
    }

    await create().run();

    expect(written.map((batch) => batch.events.map((event) => event.eventId))).toEqual([['a1', 'a2'], ['a3', 'a4'], [
      'a5',
    ]]);
    expect(remainingIds()).toEqual([]);
  });

  it('バッチ数の上限に達したら batchLimit で止まり、各バッチの鍵と件数を出す', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { addEvent, remainingIds, written, create } = setup({ batchSize: 1, maxBatches: 2 });
    addEvent('a1', at(20, 1));
    addEvent('a2', at(20, 2));
    addEvent('a3', at(20, 3));

    const result = await create().run();

    expect(result).toMatchObject({ ok: true, val: { archived: 2, objects: 2, stoppedBy: 'batchLimit' } });
    expect(remainingIds()).toEqual(['a3']);
    expect(log.mock.calls).toEqual(written.map((batch) => [
      'iori domain events archive: batch archived.',
      { key: batch.key, count: 1 },
    ]));
  });

  it('許可の一覧にも秘密の一覧にも無いイベントは NULL にして書き、名前ごとに1回だけ警告する', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { addEvent, written, create } = setup({ batchSize: 1 });
    addEvent('n1', at(20, 1), 'newThing.happened', '{"s":1}', '{"p":1}');
    addEvent('n2', at(20, 2), 'newThing.happened', '{"s":2}', '{"p":2}');
    addEvent('p1', at(20, 3), 'post.created');

    await create().run();

    expect(written.flatMap((batch) => batch.events)).toMatchObject([
      { eventId: 'n1', aggregateState: null, eventPayload: null },
      { eventId: 'n2', aggregateState: null, eventPayload: null },
      { eventId: 'p1', aggregateState: '{"a":1}', eventPayload: '{"b":2}' },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'iori domain events archive: unknown event name, aggregate_state and event_payload are NULL.',
      { eventName: 'newThing.happened' },
    );
  });

  it('R2 への書き込みに失敗したら D1 から消さずに止まる', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { addEvent, remainingIds, create } = setup();
    addEvent('a1', at(20, 1));
    addEvent('a2', at(20, 2));
    const cause = new Error('r2 down');

    const result = await create({ writer: { write: async () => RA.err(DomainEventArchiveWriteError.create(cause)) } })
      .run();

    expect(result).toMatchObject({ ok: true, val: { archived: 0, objects: 0, stoppedBy: 'writeFailed' } });
    expect(remainingIds()).toEqual(['a1', 'a2']);
    expect(error).toHaveBeenCalledWith('iori domain events archive: writing to R2 failed.', {
      count: 2,
      key: `domain-events/v1/year=2026/month=10/day=20/${at(20, 1)}-a1.parquet`,
      error: cause,
    });
  });

  it('削除件数が読んだ件数と違えば記録して止まる', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { addEvent, written, realDeleter, create } = setup({ batchSize: 2 });
    addEvent('a1', at(20, 1));
    addEvent('a2', at(20, 2));
    addEvent('a3', at(20, 3));

    const result = await create({
      deleter: { deleteRange: async (range) => RA.ok((await realDeleter.deleteRange(range)).val + 1) },
    }).run();

    expect(result).toMatchObject({ ok: true, val: { archived: 0, objects: 0, stoppedBy: 'deleteMismatch' } });
    expect(written).toHaveLength(1);
    expect(error).toHaveBeenCalledWith('iori domain events archive: deleted count differs from archived count.', {
      count: 2,
      deleted: 3,
      key: written[0]!.key,
    });
  });

  it('時間の予算を超えたら次のバッチを始めない', async () => {
    let tick = 0;
    const { addEvent, remainingIds, create } = setup({
      batchSize: 1,
      now: () => Instant.orThrow(NOW + (tick++) * 4 * 60 * 1000),
    });
    addEvent('a1', at(20, 1));
    addEvent('a2', at(20, 2));
    addEvent('a3', at(20, 3));
    addEvent('a4', at(20, 4));

    const result = await create().run();

    expect(result).toMatchObject({ ok: true, val: { stoppedBy: 'timeBudget' } });
    expect(remainingIds().length).toBeGreaterThan(0);
    expect(remainingIds().length).toBeLessThan(4);
  });

  it('やり直しでも同じ鍵と同じ中身になる', async () => {
    const puts: { key: string; body: ArrayBuffer; options: unknown }[] = [];
    const bucket = {
      put: async (key: string, body: ArrayBuffer, options: unknown) => {
        puts.push({ key, body, options });
        return null;
      },
    };
    const { addEvent, remainingIds, realDeleter, create } = setup();
    addEvent('a1', at(20, 1));
    addEvent('a2', at(20, 2), 'key.created');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const writer = createR2DomainEventArchiveWriter(bucket as never);

    const failedDelete = await create({ writer, deleter: { deleteRange: async () => RA.ok(0) } }).run();
    const retried = await create({ writer, deleter: realDeleter }).run();

    expect(failedDelete).toMatchObject({ val: { stoppedBy: 'deleteMismatch' } });
    expect(retried).toMatchObject({ val: { archived: 2, objects: 1, stoppedBy: 'drained' } });
    expect(puts).toHaveLength(2);
    expect(puts[1]!.key).toBe(puts[0]!.key);
    expect(new Uint8Array(puts[1]!.body)).toEqual(new Uint8Array(puts[0]!.body));
    expect(puts[0]!.options).toEqual({
      customMetadata: { row_count: '2' },
      sha256: await crypto.subtle.digest('SHA-256', puts[0]!.body),
    });
    expect(remainingIds()).toEqual([]);
    const rows = await parquetReadObjects({ file: puts[0]!.body });
    expect(rows.map((row) => row.event_id)).toEqual(['a1', 'a2']);
    expect(rows[1]).toMatchObject({ aggregate_state: null, event_payload: null, event_name: 'key.created' });
  });
});

describe('archiveDomainEventsTask', () => {
  const context = (env: Record<string, unknown>) => ({
    env: env as never,
    scheduledTime: new Date(NOW),
    waitUntil: () => undefined,
  });

  it.each([undefined, 'false', 'TRUE', ''])('EVENT_ARCHIVE_ENABLED が %j のときは何もしない', async (value) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const env = {
      get DB(): never {
        throw new Error('DB must not be touched');
      },
      EVENT_ARCHIVE_ENABLED: value,
    };

    await expect(archiveDomainEventsTask.run(context(env))).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it('有効でも EVENT_ARCHIVE のバインディングが無ければ失敗させる', async () => {
    await expect(archiveDomainEventsTask.run(context({ EVENT_ARCHIVE_ENABLED: 'true' }))).rejects.toThrow(
      'EVENT_ARCHIVE is not bound',
    );
  });

  it('有効なら退避して件数と鍵の数を console.log に出す', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fixture = createSqliteD1Fixture();
    const puts: string[] = [];
    const old = Date.now() - 30 * 24 * 60 * 60 * 1000;
    fixture.sqlite.prepare(
      'INSERT INTO domain_events(eventId,aggregateId,aggregateName,aggregateState,eventName,eventPayload,occurredAt) VALUES (?,?,?,?,?,?,?)',
    ).run('old', '"x"', 'post', null, 'post.deleted', '{}', old);

    await archiveDomainEventsTask.run(context({
      EVENT_ARCHIVE_ENABLED: 'true',
      DB: fixture.binding,
      EVENT_ARCHIVE: { put: async (key: string) => void puts.push(key) },
    }));

    expect(puts).toHaveLength(1);
    expect(log).toHaveBeenCalledWith('iori domain events archived.', {
      archived: 1,
      objects: 1,
      stoppedBy: 'drained',
    });
    expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM domain_events').all()).toEqual([{ n: 0 }]);
  });
});
