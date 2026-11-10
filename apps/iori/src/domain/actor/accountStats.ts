import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { ActorId } from './actorId.ts';

export type AccountStats = Readonly<{
  followersCount: number;
  followingCount: number;
  statusesCount: number;
  createdAt: Instant;
  lastStatusAt: Instant | null;
}>;

export type AccountStatsResolverByActorId = Agg.Resolver<ActorId, AccountStats>;
