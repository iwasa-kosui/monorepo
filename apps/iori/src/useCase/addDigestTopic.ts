import { RA } from '@iwasa-kosui/result';

import {
  DigestTopic,
  type DigestTopicCreatedStore,
  type DigestTopicEmbeddedStore,
  DigestTopicNotFoundError,
  type DigestTopicParseError,
  type DigestTopicsResolverByUserId,
  type StoredDigestTopic,
} from '../domain/digestTopic/digestTopic.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { TextEmbedder } from '../ports/textEmbedder.ts';
import { embedDigestTopicIfAvailable } from './helper/embedDigestTopics.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId; name: string; description: string }>;

type Err = DigestTopicNotFoundError | DigestTopicParseError;

export type AddDigestTopicUseCase = UseCase<Input, StoredDigestTopic, Err>;

type Deps = Readonly<{
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  digestTopicCreatedStore: DigestTopicCreatedStore;
  digestTopicEmbeddedStore: DigestTopicEmbeddedStore;
  textEmbedder: TextEmbedder | undefined;
  now: () => Instant;
}>;

const generateTopicKey = (registeredKeys: ReadonlySet<string>): string => {
  for (;;) {
    const topicKey = `custom-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    if (!registeredKeys.has(topicKey)) return topicKey;
  }
};

const create = ({
  digestTopicsResolverByUserId,
  digestTopicCreatedStore,
  digestTopicEmbeddedStore,
  textEmbedder,
  now,
}: Deps): AddDigestTopicUseCase => {
  const run = async ({ userId, name, description }: Input): RA<StoredDigestTopic, Err> => {
    const registered = (await digestTopicsResolverByUserId.resolve(userId)).val;
    const topicKey = generateTopicKey(new Set(registered.map((topic) => topic.topicKey)));
    const sortOrder = registered.reduce((max, topic) => Math.max(max, topic.sortOrder), -1) + 1;

    const created = DigestTopic.create({ userId, topicKey, name, description, sortOrder }, now());
    if (!created.ok) return RA.err(created.err);
    await digestTopicCreatedStore.store(created.val);
    await embedDigestTopicIfAvailable(
      { textEmbedder, digestTopicEmbeddedStore, now },
      created.val.aggregateState,
    );

    const reloaded = (await digestTopicsResolverByUserId.resolve(userId)).val.find((topic) =>
      topic.topicKey === topicKey
    );
    return reloaded === undefined ? RA.err(DigestTopicNotFoundError.create(topicKey)) : RA.ok(reloaded);
  };

  return { run };
};

export const AddDigestTopicUseCase = { create } as const;
