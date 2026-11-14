import type { Agg } from '../aggregate/index.ts';
import type { PostId } from '../post/postId.ts';

/**
 * ローカルのアクターの誰かがフォローしているリモートのアクターの、公開（public）投稿を新しい順に返す。
 * つまり、ローカルのアクターのホームタイムラインに出ているリモートの公開投稿。
 */
export type PublicRemotePostIdsResolverByLocalFollows = Agg.Resolver<
  Readonly<{ limit: number }>,
  ReadonlyArray<PostId>
>;
