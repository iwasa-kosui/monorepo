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

const embedTexts = async (
  textEmbedder: TextEmbedder,
  texts: ReadonlyArray<string>,
): RA<ReadonlyArray<ReadonlyArray<number>>, AiError> => {
  const embedded = await textEmbedder.embed({ model: INTEREST_EMBEDDING_MODEL, texts });
  if (!embedded.ok) return embedded;
  if (embedded.val.length !== texts.length) {
    return RA.err({
      type: 'AiError',
      message: `The embedder returned ${embedded.val.length} embeddings for ${texts.length} texts.`,
    });
  }
  return embedded;
};

export const embedInterestSources = async (
  { textEmbedder, interestSourceEmbeddedStore, now }: Deps,
  targets: ReadonlyArray<EmbedTarget>,
): RA<number, AiError> => {
  if (targets.length === 0) return RA.ok(0);
  const batch = await embedTexts(textEmbedder, targets.map(({ text }) => text));
  const vectors: Array<ReadonlyArray<number> | undefined> = [];
  if (batch.ok) vectors.push(...batch.val);
  else {
    let lastError = batch.err;
    for (const { source, text } of targets) {
      const single = await embedTexts(textEmbedder, [text]);
      if (single.ok) vectors.push(single.val[0]);
      else {
        lastError = single.err;
        vectors.push(undefined);
        console.error('iori interest sources: embedding an entry failed.', {
          interestSourceId: source.interestSourceId,
          kind: source.kind,
          message: single.err.message,
        });
      }
    }
    if (vectors.every((vector) => vector === undefined)) return RA.err(lastError);
  }
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
        message: event.err.message,
      });
    }
  });
  for (const batchOfEvents of chunk(events, EVENTS_PER_STORE)) {
    await interestSourceEmbeddedStore.store(...batchOfEvents);
  }
  return RA.ok(events.length);
};
