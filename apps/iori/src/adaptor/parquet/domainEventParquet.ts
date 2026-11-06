import { parquetWriteBuffer } from 'hyparquet-writer/src/index.js';

import { ARCHIVE_SCHEMA_VERSION, type ArchivedDomainEvent } from '../../domain/domainEvent/domainEventArchive.ts';

export const encodeDomainEventsParquet = (events: ReadonlyArray<ArchivedDomainEvent>): ArrayBuffer =>
  parquetWriteBuffer({
    codec: 'SNAPPY',
    columnData: [
      { name: 'event_id', type: 'STRING', nullable: false, data: events.map((event) => event.eventId) },
      { name: 'aggregate_id', type: 'STRING', nullable: false, data: events.map((event) => event.aggregateId) },
      { name: 'aggregate_name', type: 'STRING', nullable: false, data: events.map((event) => event.aggregateName) },
      { name: 'aggregate_state', type: 'STRING', nullable: true, data: events.map((event) => event.aggregateState) },
      { name: 'event_name', type: 'STRING', nullable: false, data: events.map((event) => event.eventName) },
      { name: 'event_payload', type: 'STRING', nullable: true, data: events.map((event) => event.eventPayload) },
      {
        name: 'occurred_at',
        type: 'TIMESTAMP',
        nullable: false,
        data: events.map((event) => new Date(event.occurredAt)),
      },
    ],
    kvMetadata: [
      { key: 'schema_version', value: String(ARCHIVE_SCHEMA_VERSION) },
      { key: 'row_count', value: String(events.length) },
    ],
  });
