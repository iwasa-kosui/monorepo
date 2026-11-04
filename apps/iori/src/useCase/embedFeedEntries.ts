import { RA } from '@iwasa-kosui/result';

import {
  type FeedEntriesResolverByFetchedSincePendingEmbedding,
  FeedEntry,
  type FeedEntryEmbedded,
  type FeedEntryEmbeddedStore,
} from '../domain/feedEntry/feedEntry.ts';
import { Instant } from '../domain/instant/instant.ts';
import { chunk } from '../helper/chunk.ts';
import type { AiError } from '../ports/aiError.ts';
import type { TextEmbedder } from '../ports/textEmbedder.ts';
import { embedTextsOneByOneOnFailure } from './helper/embedTexts.ts';
import type { UseCase } from './useCase.ts';

export const FEED_ENTRY_EMBEDDING_WINDOW_HOURS = 48;
export const FEED_ENTRY_EMBEDDING_BATCH_SIZE = 100;
export const FEED_ENTRY_EMBEDDING_MAX_BATCHES = 5;
const EVENTS_PER_STORE = 50;
const HOUR_MS = 60 * 60 * 1000;

type Input = void;

type Ok = Readonly<{ embedded: number; skipped: number }>;

export type EmbedFeedEntriesUseCase = UseCase<Input, Ok, AiError>;

type Deps = Readonly<{
  feedEntriesResolverByFetchedSincePendingEmbedding: FeedEntriesResolverByFetchedSincePendingEmbedding;
  feedEntryEmbeddedStore: FeedEntryEmbeddedStore;
  textEmbedder: TextEmbedder | undefined;
  now: () => Instant;
}>;

const create = ({
  feedEntriesResolverByFetchedSincePendingEmbedding,
  feedEntryEmbeddedStore,
  textEmbedder,
  now,
}: Deps): EmbedFeedEntriesUseCase => {
  const run = async (): RA<Ok, AiError> => {
    if (textEmbedder === undefined) return RA.ok({ embedded: 0, skipped: 0 });
    const pending = await feedEntriesResolverByFetchedSincePendingEmbedding.resolve({
      fetchedSince: Instant.addDuration(now(), -FEED_ENTRY_EMBEDDING_WINDOW_HOURS * HOUR_MS),
      limit: FEED_ENTRY_EMBEDDING_BATCH_SIZE * FEED_ENTRY_EMBEDDING_MAX_BATCHES,
    });
    let embedded = 0;
    let skipped = 0;
    for (const entries of chunk(pending.val, FEED_ENTRY_EMBEDDING_BATCH_SIZE)) {
      const vectors = await embedTextsOneByOneOnFailure(
        textEmbedder,
        entries.map(FeedEntry.toEmbeddingText),
        (index, error) => {
          console.error('iori feed entries: embedding an entry failed.', {
            feedEntryId: entries[index]!.feedEntryId,
            message: error.message,
          });
        },
      );
      if (!vectors.ok) {
        if (embedded === 0) return vectors;
        skipped = pending.val.length - embedded;
        break;
      }
      const timestamp = now();
      const events: FeedEntryEmbedded[] = [];
      entries.forEach((entry, index) => {
        const vector = vectors.val[index];
        if (vector === undefined) return;
        const event = FeedEntry.embed(entry, Float32Array.from(vector), timestamp);
        if (event.ok) events.push(event.val);
        else {
          console.error('iori feed entries: the embedding was not stored.', {
            feedEntryId: entry.feedEntryId,
            message: event.err.message,
          });
        }
      });
      for (const batchOfEvents of chunk(events, EVENTS_PER_STORE)) {
        await feedEntryEmbeddedStore.store(...batchOfEvents);
      }
      embedded += events.length;
      skipped += entries.length - events.length;
    }
    return RA.ok({ embedded, skipped });
  };

  return { run };
};

export const EmbedFeedEntriesUseCase = {
  create,
} as const;
