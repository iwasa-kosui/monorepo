import type { ActorId } from '../actor/actorId.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { PostId } from '../post/postId.ts';
import type { SearchTerm } from './searchTerm.ts';

export type TimelineSearchCandidate = Readonly<{
  postId: PostId;
  content: string;
  createdAt: Instant;
}>;

export type TimelineSearchCandidatesResolver = Agg.Resolver<
  {
    actorIds: ReadonlyArray<ActorId>;
    terms: ReadonlyArray<SearchTerm>;
    limit: number;
  },
  ReadonlyArray<TimelineSearchCandidate>
>;
