import { RA } from '@iwasa-kosui/result';

import {
  DigestSubscription,
  type DigestSubscriptionResolverByUserId,
  type DigestSubscriptionSavedStore,
} from '../domain/digestSubscription/digestSubscription.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId; enabled: boolean }>;

export type SaveDigestSubscriptionUseCase = UseCase<Input, DigestSubscription, never>;

type Deps = Readonly<{
  digestSubscriptionResolverByUserId: DigestSubscriptionResolverByUserId;
  digestSubscriptionSavedStore: DigestSubscriptionSavedStore;
}>;

const create = ({
  digestSubscriptionResolverByUserId,
  digestSubscriptionSavedStore,
}: Deps): SaveDigestSubscriptionUseCase => {
  const run = async ({ userId, enabled }: Input) => {
    const now = Instant.now();
    return RA.flow(
      digestSubscriptionResolverByUserId.resolve(userId),
      RA.map((previous) => DigestSubscription.save({ userId, enabled }, previous, now)),
      RA.andThrough((event) => digestSubscriptionSavedStore.store(event)),
      RA.map((event) => event.aggregateState),
    );
  };

  return { run };
};

export const SaveDigestSubscriptionUseCase = { create } as const;
