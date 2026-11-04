import { RA } from '@iwasa-kosui/result';

import {
  type AggregateIdHasher,
  type ArchivableDomainEventsResolver,
  type ArchivedDomainEventsDeleter,
  DomainEventArchive,
  type DomainEventArchiveWriter,
} from '../domain/domainEvent/domainEventArchive.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

export const ARCHIVE_BATCH_SIZE = 5000;
export const ARCHIVE_TIME_BUDGET_MS = 10 * 60 * 1000;

type Input = void;

type Ok = Readonly<{
  archived: number;
  objects: number;
  stoppedBy: 'drained' | 'timeBudget' | 'writeFailed' | 'deleteMismatch';
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
}>;

const create = ({
  archivableDomainEventsResolver,
  domainEventArchiveWriter,
  archivedDomainEventsDeleter,
  aggregateIdHasher,
  now,
  batchSize = ARCHIVE_BATCH_SIZE,
  timeBudgetMs = ARCHIVE_TIME_BUDGET_MS,
}: Deps): ArchiveDomainEventsUseCase => {
  const run = async () => {
    const startedAt = now();
    const cutoff = DomainEventArchive.cutoffOf(startedAt);
    let archived = 0;
    let objects = 0;
    let stoppedBy: Ok['stoppedBy'] = 'timeBudget';
    while (now() - startedAt < timeBudgetMs) {
      const resolved = await archivableDomainEventsResolver.resolve({ cutoff, limit: batchSize });
      const events = DomainEventArchive.takeSameUtcDay(resolved.val);
      const first = events[0];
      const last = events.at(-1);
      if (first === undefined || last === undefined) {
        stoppedBy = 'drained';
        break;
      }
      const key = DomainEventArchive.objectKey(first);
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
      const deleted = await archivedDomainEventsDeleter.deleteRange({ first, last, cutoff });
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
    }
    return RA.ok({ archived, objects, stoppedBy });
  };

  return { run };
};

export const ArchiveDomainEventsUseCase = {
  create,
} as const;
