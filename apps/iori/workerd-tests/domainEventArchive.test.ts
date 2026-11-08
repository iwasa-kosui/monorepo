import { env } from 'cloudflare:test';
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { describe, expect, it } from 'vitest';

import { encodeDomainEventsParquet } from '../src/adaptor/parquet/domainEventParquet.ts';
import { createR2DomainEventArchiveWriter } from '../src/adaptor/r2/domainEventArchiveWriter.ts';
import type { ArchivedDomainEvent } from '../src/domain/domainEvent/domainEventArchive.ts';
import { Instant } from '../src/domain/instant/instant.ts';

const events: ArchivedDomainEvent[] = [
  {
    eventId: '00000000-0000-4000-8000-000000000001',
    aggregateId: '"agg-1"',
    aggregateName: 'post',
    aggregateState: '{"text":"こんにちは"}',
    eventName: 'post.created',
    eventPayload: '{"b":2}',
    occurredAt: Instant.orThrow(Date.UTC(2026, 9, 20, 1, 2, 3, 456)),
  },
  {
    eventId: '00000000-0000-4000-8000-000000000002',
    aggregateId: '"agg-2"',
    aggregateName: 'key',
    aggregateState: null,
    eventName: 'key.created',
    eventPayload: null,
    occurredAt: Instant.orThrow(Date.UTC(2026, 9, 20, 4)),
  },
];

const expectedRows = [
  {
    event_id: events[0]!.eventId,
    aggregate_id: '"agg-1"',
    aggregate_name: 'post',
    aggregate_state: '{"text":"こんにちは"}',
    event_name: 'post.created',
    event_payload: '{"b":2}',
    occurred_at: new Date(events[0]!.occurredAt),
  },
  {
    event_id: events[1]!.eventId,
    aggregate_id: '"agg-2"',
    aggregate_name: 'key',
    aggregate_state: null,
    event_name: 'key.created',
    event_payload: null,
    occurred_at: new Date(events[1]!.occurredAt),
  },
];

describe('domain event archive on workerd', () => {
  it('hyparquet-writer で書いた Parquet を hyparquet で読み戻すと、列と行数が一致する', async () => {
    const buffer = encodeDomainEventsParquet(events);

    const metadata = await parquetMetadataAsync(buffer);
    const rows = await parquetReadObjects({ file: buffer });

    expect(metadata.num_rows).toBe(2n);
    expect(metadata.key_value_metadata).toEqual([
      { key: 'schema_version', value: '1' },
      { key: 'row_count', value: '2' },
    ]);
    expect(metadata.row_groups[0]!.columns.map((column) => column.meta_data?.codec)).toEqual(
      Array(7).fill('SNAPPY'),
    );
    expect(rows).toEqual(expectedRows);
  });

  it('R2 に put した Parquet を取り出して読み戻せる', async () => {
    const bucket = env.EVENT_ARCHIVE;
    expect(bucket).toBeDefined();
    const key = `domain-events/v1/workerd-test/${crypto.randomUUID()}.parquet`;

    const written = await createR2DomainEventArchiveWriter(bucket!).write({ key, events });

    expect(written.ok).toBe(true);
    const object = await bucket!.get(key);
    expect(object?.customMetadata).toEqual({ row_count: '2' });
    expect(object?.checksums.sha256).toEqual(await crypto.subtle.digest('SHA-256', encodeDomainEventsParquet(events)));
    expect(await parquetReadObjects({ file: await object!.arrayBuffer() })).toEqual(expectedRows);
    await bucket!.delete(key);
  });
});
