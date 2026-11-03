import { RA } from '@iwasa-kosui/result';

import type { Instant } from '../../domain/instant/instant.ts';
import {
  InterestSource,
  type InterestSourceEmbedded,
  type InterestSourceEmbeddedStore,
} from '../../domain/interestSource/interestSource.ts';
import { chunk } from '../../helper/chunk.ts';
import type { AiError } from '../../ports/aiError.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';

export const INTEREST_EMBEDDING_MODEL = '@cf/baai/bge-m3';

const EVENTS_PER_STORE = 50;

type Deps = Readonly<{
  textEmbedder: TextEmbedder;
  interestSourceEmbeddedStore: InterestSourceEmbeddedStore;
  now: () => Instant;
}>;

export type EmbedTarget = Readonly<{ source: InterestSource; text: string }>;

export const embedInterestSources = async (
  { textEmbedder, interestSourceEmbeddedStore, now }: Deps,
  targets: ReadonlyArray<EmbedTarget>,
): RA<number, AiError> => {
  if (targets.length === 0) return RA.ok(0);
  const embedded = await textEmbedder.embed({
    model: INTEREST_EMBEDDING_MODEL,
    texts: targets.map(({ text }) => text),
  });
  if (!embedded.ok) return embedded;
  if (embedded.val.length !== targets.length) {
    return RA.err({
      type: 'AiError',
      message: `The embedder returned ${embedded.val.length} embeddings for ${targets.length} texts.`,
    });
  }
  const timestamp = now();
  const events: InterestSourceEmbedded[] = [];
  targets.forEach(({ source }, index) => {
    const event = InterestSource.embed(source, Float32Array.from(embedded.val[index] ?? []), timestamp);
    if (event.ok) events.push(event.val);
    else {
      console.error('iori interest sources: the embedding was not stored.', {
        interestSourceId: source.interestSourceId,
        kind: source.kind,
        message: event.err.message,
      });
    }
  });
  for (const batch of chunk(events, EVENTS_PER_STORE)) await interestSourceEmbeddedStore.store(...batch);
  return RA.ok(events.length);
};
