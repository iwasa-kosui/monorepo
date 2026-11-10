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
import { embedTextsOneByOneOnFailure, INTEREST_EMBEDDING_MODEL } from './embedTexts.ts';

export { INTEREST_EMBEDDING_MODEL };

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
  const embedded = await embedTextsOneByOneOnFailure(textEmbedder, targets.map(({ text }) => text), (index, error) => {
    const { source } = targets[index]!;
    console.error('iori interest sources: embedding an entry failed.', {
      interestSourceId: source.interestSourceId,
      kind: source.kind,
      errorMessage: error.message,
    });
  });
  if (!embedded.ok) return embedded;
  const vectors = embedded.val;
  const timestamp = now();
  const events: InterestSourceEmbedded[] = [];
  targets.forEach(({ source }, index) => {
    const vector = vectors[index];
    if (vector === undefined) return;
    const event = InterestSource.embed(source, Float32Array.from(vector), timestamp);
    if (event.ok) events.push(event.val);
    else {
      console.error('iori interest sources: the embedding was not stored.', {
        interestSourceId: source.interestSourceId,
        kind: source.kind,
        errorMessage: event.err.message,
      });
    }
  });
  for (const batchOfEvents of chunk(events, EVENTS_PER_STORE)) {
    await interestSourceEmbeddedStore.store(...batchOfEvents);
  }
  return RA.ok(events.length);
};
