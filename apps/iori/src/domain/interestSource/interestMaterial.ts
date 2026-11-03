import type { ActorId } from '../actor/actorId.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { LikeId } from '../like/likeId.ts';
import type { PostId } from '../post/postId.ts';

export type PostContent = Readonly<{ postId: PostId; content: string }>;
export type LikedPostContent = Readonly<{ likeId: LikeId; content: string }>;
export type OwnPostContent = Readonly<PostContent & { createdAt: Instant }>;
export type OwnLikeContent = Readonly<LikedPostContent & { createdAt: Instant }>;

export type OwnPostContentsResolverByActorId = Agg.Resolver<ActorId, ReadonlyArray<OwnPostContent>>;
export type OwnLikeContentsResolverByActorId = Agg.Resolver<ActorId, ReadonlyArray<OwnLikeContent>>;
export type PostContentsResolverByPostIds = Agg.Resolver<ReadonlyArray<PostId>, ReadonlyArray<PostContent>>;
export type LikedPostContentsResolverByLikeIds = Agg.Resolver<
  ReadonlyArray<LikeId>,
  ReadonlyArray<LikedPostContent>
>;
