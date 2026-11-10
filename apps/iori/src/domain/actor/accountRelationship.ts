import type { Agg } from '../aggregate/index.ts';
import type { UserId } from '../user/userId.ts';
import type { Username } from '../user/username.ts';
import type { ActorId } from './actorId.ts';

export type AccountRelationship = Readonly<{
  actorId: ActorId;
  following: boolean;
  followedBy: boolean;
  muting: boolean;
}>;

export type AccountRelationshipsResolverByActorIds = Agg.Resolver<
  Readonly<{ viewerActorId: ActorId; viewerUserId: UserId; actorIds: ReadonlyArray<ActorId> }>,
  ReadonlyArray<AccountRelationship>
>;

export type AcctLookup =
  | Readonly<{ type: 'local'; username: Username }>
  | Readonly<{ type: 'remote'; username: string; host: string }>;

export type ActorIdResolverByAcct = Agg.Resolver<AcctLookup, ActorId | undefined>;
