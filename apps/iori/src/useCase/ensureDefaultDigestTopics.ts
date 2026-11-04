import { RA } from '@iwasa-kosui/result';

import { defaultDigestTopics } from '../domain/digestTopic/defaultDigestTopics.ts';
import {
  DigestTopic,
  type DigestTopicCreated,
  type DigestTopicCreatedStore,
  type DigestTopicEmbedded,
  type DigestTopicEmbeddedStore,
  type DigestTopicsResolverByUserId,
  type StoredDigestTopic,
} from '../domain/digestTopic/digestTopic.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { TextEmbedder } from '../ports/textEmbedder.ts';
import { embedTextsOneByOneOnFailure } from './helper/embedTexts.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId }>;

type Ok = Readonly<{ created: number; embedded: number; topics: ReadonlyArray<StoredDigestTopic> }>;

type Err = never;

export type EnsureDefaultDigestTopicsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  digestTopicCreatedStore: DigestTopicCreatedStore;
  digestTopicEmbeddedStore: DigestTopicEmbeddedStore;
  textEmbedder: TextEmbedder | undefined;
  now: () => Instant;
}>;

const create = ({
  digestTopicsResolverByUserId,
  digestTopicCreatedStore,
  digestTopicEmbeddedStore,
  textEmbedder,
  now,
}: Deps): EnsureDefaultDigestTopicsUseCase => {
  const ensure = async (userId: UserId): Promise<Readonly<{ created: number; embedded: number }>> => {
    const registered = (await digestTopicsResolverByUserId.resolve(userId)).val;
    const registeredKeys = new Set(registered.map((topic) => topic.topicKey));
    const createdEvents: DigestTopicCreated[] = [];
    for (const [sortOrder, defaultTopic] of defaultDigestTopics.entries()) {
      if (registeredKeys.has(defaultTopic.topicKey)) continue;
      const created = DigestTopic.create({ ...defaultTopic, userId, sortOrder }, now());
      if (!created.ok) throw new Error(`Invalid default digest topic: ${created.err.message}`);
      createdEvents.push(created.val);
    }
    if (createdEvents.length > 0) await digestTopicCreatedStore.store(...createdEvents);

    const pending: DigestTopic[] = [
      ...registered.filter((topic) => topic.embedding === null).map(({ embedding: _embedding, ...topic }) => topic),
      ...createdEvents.map((event) => event.aggregateState),
    ];
    if (textEmbedder === undefined || pending.length === 0) {
      return { created: createdEvents.length, embedded: 0 };
    }

    const vectors = await embedTextsOneByOneOnFailure(
      textEmbedder,
      pending.map(DigestTopic.toEmbeddingText),
      (index, error) => {
        console.error('iori digest topics: embedding a topic failed.', {
          topicKey: pending[index]!.topicKey,
          errorMessage: error.message,
        });
      },
    );
    if (!vectors.ok) {
      console.error('iori digest topics: embedding topics failed.', { errorMessage: vectors.err.message });
      return { created: createdEvents.length, embedded: 0 };
    }
    const timestamp = now();
    const embeddedEvents: DigestTopicEmbedded[] = [];
    pending.forEach((topic, index) => {
      const vector = vectors.val[index];
      if (vector === undefined) return;
      const event = DigestTopic.embed(topic, Float32Array.from(vector), timestamp);
      if (event.ok) embeddedEvents.push(event.val);
      else {
        console.error('iori digest topics: a topic embedding was rejected.', {
          topicKey: topic.topicKey,
          errorMessage: event.err.message,
        });
      }
    });
    if (embeddedEvents.length > 0) await digestTopicEmbeddedStore.store(...embeddedEvents);
    return { created: createdEvents.length, embedded: embeddedEvents.length };
  };

  const run = async ({ userId }: Input): RA<Ok, Err> => {
    const counts = await ensure(userId);
    const topics = (await digestTopicsResolverByUserId.resolve(userId)).val;
    return RA.ok({ ...counts, topics });
  };

  return { run };
};

export const EnsureDefaultDigestTopicsUseCase = {
  create,
} as const;
