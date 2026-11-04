import { sha256Hex } from '../adaptor/crypto/sha256Hex.ts';
import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1ArchivableDomainEventsResolver } from '../adaptor/d1/domainEvent/archivableDomainEventsResolver.ts';
import { createD1ArchivedDomainEventsDeleter } from '../adaptor/d1/domainEvent/archivedDomainEventsDeleter.ts';
import { createR2DomainEventArchiveWriter } from '../adaptor/r2/domainEventArchiveWriter.ts';
import { Instant } from '../domain/instant/instant.ts';
import { ArchiveDomainEventsUseCase } from '../useCase/archiveDomainEvents.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const archiveDomainEventsTask: ScheduledTask = {
  name: 'archiveDomainEvents',
  run: async ({ env }) => {
    if (env.EVENT_ARCHIVE_ENABLED !== 'true') return;
    const useCase = createArchiveDomainEventsUseCase(env);
    const result = await useCase.run();
    if (
      result.val.stoppedBy === 'drained' || result.val.stoppedBy === 'timeBudget'
      || result.val.stoppedBy === 'batchLimit'
    ) {
      console.log('iori domain events archived.', result.val);
    }
  },
};

export const createArchiveDomainEventsUseCase = (env: IoriWorkerEnv): ArchiveDomainEventsUseCase => {
  if (env.EVENT_ARCHIVE === undefined) throw new Error('iori domain events archive: EVENT_ARCHIVE is not bound.');
  const db = createD1Db(env.DB);
  return ArchiveDomainEventsUseCase.create({
    archivableDomainEventsResolver: createD1ArchivableDomainEventsResolver(db),
    domainEventArchiveWriter: createR2DomainEventArchiveWriter(env.EVENT_ARCHIVE),
    archivedDomainEventsDeleter: createD1ArchivedDomainEventsDeleter(db),
    aggregateIdHasher: sha256Hex,
    now: Instant.now,
  });
};
