import type { ActorId } from '../actor/actorId.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { PostId } from '../post/postId.ts';

export const HOME_POSTS_BY_PERIOD_LIMIT = 300;

export type HomePostsResolverByPeriod = Agg.Resolver<
  {
    actorIds: ReadonlyArray<ActorId>;
    since: Instant;
    until: Instant;
  },
  ReadonlyArray<PostId>
>;
