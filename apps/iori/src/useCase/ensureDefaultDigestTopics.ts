import { RA } from '@iwasa-kosui/result';

import { defaultDigestTopics } from '../domain/digestTopic/defaultDigestTopics.ts';
import {
  DigestTopic,
  type DigestTopicCreated,
  type DigestTopicCreatedStore,
  type DigestTopicEmbeddedStore,
  type DigestTopicsResolverByUserId,
  type StoredDigestTopic,
} from '../domain/digestTopic/digestTopic.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { TextEmbedder } from '../ports/textEmbedder.ts';
import { embedDigestTopics } from './helper/embedDigestTopics.ts';
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
      ...registered.filter((topic) => topic.embedding === null).map((
        { embedding: _embedding, excludeEmbedding: _excludeEmbedding, ...topic },
      ) => topic),
      ...createdEvents.map((event) => event.aggregateState),
    ];
    if (textEmbedder === undefined || pending.length === 0) {
      return { created: createdEvents.length, embedded: 0 };
    }

    const embedded = await embedDigestTopics({ textEmbedder, digestTopicEmbeddedStore, now }, pending);
    return { created: createdEvents.length, embedded };
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
