import { RA } from '@iwasa-kosui/result';

import {
  DigestTopic,
  type DigestTopicEnabledChangedStore,
  DigestTopicNotFoundError,
  type DigestTopicParseError,
  type DigestTopicsResolverByUserId,
  type StoredDigestTopic,
} from '../domain/digestTopic/digestTopic.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId; topicKey: string; enabled: boolean }>;

type Err = DigestTopicNotFoundError | DigestTopicParseError;

export type ChangeDigestTopicEnabledUseCase = UseCase<Input, StoredDigestTopic, Err>;

type Deps = Readonly<{
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  digestTopicEnabledChangedStore: DigestTopicEnabledChangedStore;
  now: () => Instant;
}>;

const create = ({
  digestTopicsResolverByUserId,
  digestTopicEnabledChangedStore,
  now,
}: Deps): ChangeDigestTopicEnabledUseCase => {
  const find = async (userId: UserId, topicKey: string) =>
    (await digestTopicsResolverByUserId.resolve(userId)).val.find((topic) => topic.topicKey === topicKey);

  const run = async ({ userId, topicKey, enabled }: Input): RA<StoredDigestTopic, Err> => {
    const topic = await find(userId, topicKey);
    if (topic === undefined) return RA.err(DigestTopicNotFoundError.create(topicKey));
    if (topic.enabled === enabled) return RA.ok(topic);

    const changed = DigestTopic.setEnabled(topic, enabled, now());
    if (!changed.ok) return RA.err(changed.err);
    await digestTopicEnabledChangedStore.store(changed.val);

    const reloaded = await find(userId, topicKey);
    return reloaded === undefined ? RA.err(DigestTopicNotFoundError.create(topicKey)) : RA.ok(reloaded);
  };

  return { run };
};

export const ChangeDigestTopicEnabledUseCase = { create } as const;
