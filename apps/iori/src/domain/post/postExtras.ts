import type { ActorId } from '../actor/actorId.ts';
import type { Agg } from '../aggregate/index.ts';
import type { BlueskyCrosspost } from '../blueskyCrosspost/blueskyCrosspost.ts';
import type { PostWithAuthor } from './post.ts';
import type { PostId } from './postId.ts';

export type PostExtras = Readonly<{
  repliesCount: number;
  inReplyTo: Readonly<{ postId: PostId; actorId: ActorId }> | null;
  myReactionEmojis: ReadonlyArray<string>;
  bookmarked: boolean;
  blueskyCrosspost: BlueskyCrosspost | null;
  quote: Readonly<{ uri: string; post: PostWithAuthor | null }> | null;
}>;

export type PostExtrasResolverByPosts = Agg.Resolver<
  Readonly<{ posts: ReadonlyArray<PostWithAuthor>; currentActorId: ActorId | undefined }>,
  ReadonlyMap<PostId, PostExtras>
>;
