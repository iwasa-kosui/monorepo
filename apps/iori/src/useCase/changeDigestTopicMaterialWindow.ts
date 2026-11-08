import { RA } from '@iwasa-kosui/result';

import {
  DigestTopic,
  type DigestTopicMaterialWindowChangedStore,
  DigestTopicNotFoundError,
  type DigestTopicParseError,
  type DigestTopicsResolverByUserId,
  type StoredDigestTopic,
} from '../domain/digestTopic/digestTopic.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId; topicKey: string; materialWindowHours: number | null }>;

type Err = DigestTopicNotFoundError | DigestTopicParseError;

export type ChangeDigestTopicMaterialWindowUseCase = UseCase<Input, StoredDigestTopic, Err>;

type Deps = Readonly<{
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  digestTopicMaterialWindowChangedStore: DigestTopicMaterialWindowChangedStore;
  now: () => Instant;
}>;

const create = ({
  digestTopicsResolverByUserId,
  digestTopicMaterialWindowChangedStore,
  now,
}: Deps): ChangeDigestTopicMaterialWindowUseCase => {
  const find = async (userId: UserId, topicKey: string) =>
    (await digestTopicsResolverByUserId.resolve(userId)).val.find((topic) => topic.topicKey === topicKey);

  const run = async ({ userId, topicKey, materialWindowHours }: Input): RA<StoredDigestTopic, Err> => {
    const topic = await find(userId, topicKey);
    if (topic === undefined) return RA.err(DigestTopicNotFoundError.create(topicKey));
    if (topic.materialWindowHours === materialWindowHours) return RA.ok(topic);

    const changed = DigestTopic.setMaterialWindowHours(topic, materialWindowHours, now());
    if (!changed.ok) return RA.err(changed.err);
    await digestTopicMaterialWindowChangedStore.store(changed.val);

    const reloaded = await find(userId, topicKey);
    return reloaded === undefined ? RA.err(DigestTopicNotFoundError.create(topicKey)) : RA.ok(reloaded);
  };

  return { run };
};

export const ChangeDigestTopicMaterialWindowUseCase = { create } as const;
