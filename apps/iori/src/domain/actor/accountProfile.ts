import type { Agg } from '../aggregate/index.ts';
import type { PageRequest } from '../page/page.ts';
import type { User } from '../user/user.ts';
import type { AccountStats } from './accountStats.ts';
import type { LocalActor, RemoteActor } from './actor.ts';
import type { ActorId } from './actorId.ts';

export type AccountProfile =
  | Readonly<{ type: 'local'; user: User; actor: LocalActor; stats: AccountStats }>
  | Readonly<{ type: 'remote'; actor: RemoteActor; stats: AccountStats }>;

export type AccountProfilesResolverByActorIds = Agg.Resolver<
  ReadonlyArray<ActorId>,
  ReadonlyMap<ActorId, AccountProfile>
>;

export type ActorIdsResolverByFollowerIdWithPagination = Agg.Resolver<
  Readonly<{ actorId: ActorId; page: PageRequest }>,
  ReadonlyArray<ActorId>
>;

export type ActorIdsResolverByFollowingIdWithPagination = Agg.Resolver<
  Readonly<{ actorId: ActorId; page: PageRequest }>,
  ReadonlyArray<ActorId>
>;
