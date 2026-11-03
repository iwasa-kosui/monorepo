import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { UserId } from '../user/userId.ts';

export type DigestSubscription = Readonly<{
  userId: UserId;
  enabled: boolean;
  createdAt: Instant;
  updatedAt: Instant;
}>;

export type DigestSubscriptionResolverByUserId = Agg.Resolver<UserId, DigestSubscription | undefined>;
