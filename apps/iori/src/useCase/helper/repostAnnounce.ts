import { type RequestContext } from '@fedify/fedify';
import { Announce, Article as FedifyArticle, Note, PUBLIC_COLLECTION } from '@fedify/vocab';

import type { ArticleResolverByRootPostId } from '../../domain/article/article.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { RepostId } from '../../domain/repost/repostId.ts';
import type { Username } from '../../domain/user/username.ts';

export const repostAnnounceUri = (
  ctx: RequestContext<unknown>,
  username: Username,
  repostId: RepostId,
): URL => new URL(`#announces/${repostId}`, ctx.getActorUri(username));

export const createRepostAnnounce = (
  { ctx, username, id, object, authorActorUri }: Readonly<{
    ctx: RequestContext<unknown>;
    username: Username;
    id: URL;
    object: URL;
    authorActorUri: URL | undefined;
  }>,
): Announce =>
  new Announce({
    id,
    actor: ctx.getActorUri(username),
    object,
    to: PUBLIC_COLLECTION,
    ccs: authorActorUri === undefined
      ? [ctx.getFollowersUri(username)]
      : [authorActorUri, ctx.getFollowersUri(username)],
  });

export const resolveLocalPostObjectUri = async (
  { ctx, authorUsername, postId, articleResolverByRootPostId }: Readonly<{
    ctx: RequestContext<unknown>;
    authorUsername: Username;
    postId: PostId;
    articleResolverByRootPostId: ArticleResolverByRootPostId;
  }>,
): Promise<URL> => {
  const articleResult = await articleResolverByRootPostId.resolve({ rootPostId: postId });
  const article = articleResult.ok ? articleResult.val : undefined;
  return article?.status === 'published'
    ? ctx.getObjectUri(FedifyArticle, { identifier: authorUsername, id: article.articleId })
    : ctx.getObjectUri(Note, { identifier: authorUsername, id: postId });
};
