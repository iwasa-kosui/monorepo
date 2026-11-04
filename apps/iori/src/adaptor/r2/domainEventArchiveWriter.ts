import type { R2Bucket } from '@cloudflare/workers-types';
import { RA } from '@iwasa-kosui/result';

import {
  DomainEventArchiveWriteError,
  type DomainEventArchiveWriter,
} from '../../domain/domainEvent/domainEventArchive.ts';
import { encodeDomainEventsParquet } from '../parquet/domainEventParquet.ts';

export type DomainEventArchiveR2Bucket = Pick<R2Bucket, 'put'>;

export const createR2DomainEventArchiveWriter = (bucket: DomainEventArchiveR2Bucket): DomainEventArchiveWriter => ({
  write: ({ key, events }) =>
    RA.try(async () => {
      await bucket.put(key, encodeDomainEventsParquet(events), {
        customMetadata: { row_count: String(events.length) },
      });
    }, DomainEventArchiveWriteError.create)(),
});
