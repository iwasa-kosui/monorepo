import type { Agg } from '../aggregate/index.ts';
import type { UserId } from '../user/userId.ts';
import type { Username } from '../user/username.ts';
import type { ActorId } from './actorId.ts';

export type AccountRelationship = Readonly<{
  actorId: ActorId;
  following: boolean;
  followedBy: boolean;
  muting: boolean;
  blocking: boolean;
}>;

export type AccountRelationshipsResolverByActorIds = Agg.Resolver<
  Readonly<{ viewerActorId: ActorId; viewerUserId: UserId; actorIds: ReadonlyArray<ActorId> }>,
  ReadonlyArray<AccountRelationship>
>;

export type AcctLookup =
  | Readonly<{ type: 'local'; username: Username }>
  | Readonly<{ type: 'remote'; username: string; host: string }>;

export type ActorIdResolverByAcct = Agg.Resolver<AcctLookup, ActorId | undefined>;

/**
 * メンションの候補を探すための条件。`username` は前方一致、`host` を与えたときはホストも前方一致で絞る。
 * 候補にするのはローカルのアカウントと、閲覧者がフォローしているかフォローされているリモートのアカウントだけ。
 */
export type MentionCandidateQuery = Readonly<{
  viewerActorId: ActorId;
  username: string;
  host: string | undefined;
  limit: number;
}>;

export type ActorIdsResolverByMentionQuery = Agg.Resolver<MentionCandidateQuery, ReadonlyArray<ActorId>>;
