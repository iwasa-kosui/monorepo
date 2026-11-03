import type { ActorId } from '../actor/actorId.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { PageRequest } from '../page/page.ts';
import type { RepostId } from '../repost/repostId.ts';
import type { PostWithAuthor } from './post.ts';

export type AccountStatusItem =
  | Readonly<{ type: 'post'; post: PostWithAuthor }>
  | Readonly<{
    type: 'repost';
    repostId: RepostId;
    reposterActorId: ActorId;
    createdAt: Instant;
    post: PostWithAuthor;
  }>;

export type AccountStatusItemsResolverByActorId = Agg.Resolver<
  Readonly<{
    actorId: ActorId;
    currentActorId: ActorId | undefined;
    page: PageRequest;
    excludeReplies: boolean;
    excludeReblogs: boolean;
    onlyMedia: boolean;
    onlyVisibleToViewer?: boolean;
  }>,
  AccountStatusItem[]
>;
