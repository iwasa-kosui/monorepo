import { RA } from '@iwasa-kosui/result';

import {
  DigestTopic,
  type DigestTopicEditedStore,
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

type Input = Readonly<{
  userId: UserId;
  topicKey: string;
  name?: string;
  description?: string;
  examples?: ReadonlyArray<string>;
  excludes?: ReadonlyArray<string>;
}>;

const sameList = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

type Err = DigestTopicNotFoundError | DigestTopicParseError;

export type EditDigestTopicUseCase = UseCase<Input, StoredDigestTopic, Err>;

type Deps = Readonly<{
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  digestTopicEditedStore: DigestTopicEditedStore;
  digestTopicEmbeddedStore: DigestTopicEmbeddedStore;
  textEmbedder: TextEmbedder | undefined;
  now: () => Instant;
}>;

const create = ({
  digestTopicsResolverByUserId,
  digestTopicEditedStore,
  digestTopicEmbeddedStore,
  textEmbedder,
  now,
}: Deps): EditDigestTopicUseCase => {
  const find = async (userId: UserId, topicKey: string) =>
    (await digestTopicsResolverByUserId.resolve(userId)).val.find((topic) => topic.topicKey === topicKey);

  const run = async (
    { userId, topicKey, name, description, examples, excludes }: Input,
  ): RA<StoredDigestTopic, Err> => {
    const topic = await find(userId, topicKey);
    if (topic === undefined) return RA.err(DigestTopicNotFoundError.create(topicKey));
    const next = {
      name: name ?? topic.name,
      description: description ?? topic.description,
      examples: [...examples ?? topic.examples],
      excludes: [...excludes ?? topic.excludes],
    };
    if (
      next.name === topic.name && next.description === topic.description && sameList(next.examples, topic.examples)
      && sameList(next.excludes, topic.excludes)
    ) return RA.ok(topic);

    const edited = DigestTopic.edit(topic, next, now());
    if (!edited.ok) return RA.err(edited.err);
    await digestTopicEditedStore.store(edited.val);
    await embedDigestTopicIfAvailable(
      { textEmbedder, digestTopicEmbeddedStore, now },
      edited.val.aggregateState,
    );

    const reloaded = await find(userId, topicKey);
    return reloaded === undefined ? RA.err(DigestTopicNotFoundError.create(topicKey)) : RA.ok(reloaded);
  };

  return { run };
};

export const EditDigestTopicUseCase = { create } as const;
