import { RA } from '@iwasa-kosui/result';

import {
  type AggregateIdHasher,
  type ArchivableDomainEventsResolver,
  ARCHIVE_BYTE_BUDGET,
  type ArchivedDomainEventsDeleter,
  DomainEventArchive,
  type DomainEventArchiveWriter,
} from '../domain/domainEvent/domainEventArchive.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

export const ARCHIVE_BATCH_SIZE = 5000;
export const ARCHIVE_TIME_BUDGET_MS = 10 * 60 * 1000;
export const ARCHIVE_MAX_BATCHES = 100;

type Input = void;

type Ok = Readonly<{
  archived: number;
  objects: number;
  stoppedBy: 'drained' | 'timeBudget' | 'batchLimit' | 'writeFailed' | 'deleteMismatch';
}>;

type Err = never;

export type ArchiveDomainEventsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  archivableDomainEventsResolver: ArchivableDomainEventsResolver;
  domainEventArchiveWriter: DomainEventArchiveWriter;
  archivedDomainEventsDeleter: ArchivedDomainEventsDeleter;
  aggregateIdHasher: AggregateIdHasher;
  now: () => Instant;
  batchSize?: number;
  timeBudgetMs?: number;
  byteBudget?: number;
  maxBatches?: number;
}>;

const create = ({
  archivableDomainEventsResolver,
  domainEventArchiveWriter,
  archivedDomainEventsDeleter,
  aggregateIdHasher,
  now,
  batchSize = ARCHIVE_BATCH_SIZE,
  timeBudgetMs = ARCHIVE_TIME_BUDGET_MS,
  byteBudget = ARCHIVE_BYTE_BUDGET,
  maxBatches = ARCHIVE_MAX_BATCHES,
}: Deps): ArchiveDomainEventsUseCase => {
  const run = async () => {
    const startedAt = now();
    const cutoff = DomainEventArchive.cutoffOf(startedAt);
    let archived = 0;
    let objects = 0;
    let stoppedBy: Ok['stoppedBy'] = 'timeBudget';
    const warned = new Set<string>();
    while (now() - startedAt < timeBudgetMs) {
      if (objects >= maxBatches) {
        stoppedBy = 'batchLimit';
        break;
      }
      const resolved = await archivableDomainEventsResolver.resolve({ cutoff, limit: batchSize, byteBudget });
      const events = DomainEventArchive.takeSameUtcDay(resolved.val);
      const first = events[0];
      const last = events.at(-1);
      if (first === undefined || last === undefined) {
        stoppedBy = 'drained';
        break;
      }
      const key = DomainEventArchive.objectKey(first);
      for (const eventName of DomainEventArchive.unknownEventNames(events)) {
        if (warned.has(eventName)) continue;
        warned.add(eventName);
        console.warn('iori domain events archive: unknown event name, aggregate_state and event_payload are NULL.', {
          eventName,
        });
      }
      const redacted = await Promise.all(events.map(DomainEventArchive.redact(aggregateIdHasher)));
      const written = await domainEventArchiveWriter.write({ key, events: redacted });
      if (!written.ok) {
        console.error('iori domain events archive: writing to R2 failed.', {
          count: events.length,
          key,
          error: written.err.cause,
        });
        stoppedBy = 'writeFailed';
        break;
      }
      const deleted = await archivedDomainEventsDeleter.deleteRange({ first, last, cutoff, count: events.length });
      if (deleted.val !== events.length) {
        console.error('iori domain events archive: deleted count differs from archived count.', {
          count: events.length,
          deleted: deleted.val,
          key,
        });
        stoppedBy = 'deleteMismatch';
        break;
      }
      archived += events.length;
      objects += 1;
      console.log('iori domain events archive: batch archived.', { key, count: events.length });
    }
    return RA.ok({ archived, objects, stoppedBy });
  };

  return { run };
};

export const ArchiveDomainEventsUseCase = {
  create,
} as const;
