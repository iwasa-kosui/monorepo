import { Article as FedifyArticle, Delete, Note, type RequestContext, Tombstone } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Article, type ArticleDeletedStore, type ArticleResolverByRootPostId } from '../domain/article/article.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Post, type PostDeletedStore, PostNotFoundError, type PostResolver } from '../domain/post/post.ts';
import { PostId } from '../domain/post/postId.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import { SessionId } from '../domain/session/sessionId.ts';
import { UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  postId: PostId;
  ctx: RequestContext<unknown>;
}>;

const Ok = Schema.create(
  z.object({
    success: z.boolean(),
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type UnauthorizedError = Readonly<{
  type: 'UnauthorizedError';
  message: string;
}>;

const UnauthorizedError = {
  create: (): UnauthorizedError => ({
    type: 'UnauthorizedError',
    message: 'You are not authorized to delete this post.',
  }),
} as const;

type Err = SessionExpiredError | UserNotFoundError | PostNotFoundError | UnauthorizedError;

export type DeletePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  postDeletedStore: PostDeletedStore;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  postResolver: PostResolver;
  // Article is a child aggregate of Post, so we keep it
  articleResolverByRootPostId: ArticleResolverByRootPostId;
  articleDeletedStore: ArticleDeletedStore;
}>;

const create = ({
  sessionResolver,
  postDeletedStore,
  userResolver,
  actorResolverByUserId,
  postResolver,
  articleResolverByRootPostId,
  articleDeletedStore,
}: Deps): DeletePostUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andBind('post', async ({ postId }) => {
        const post = await postResolver.resolve(postId);
        if (!post.ok) {
          return post;
        }
        if (post.val === undefined) {
          return RA.err(PostNotFoundError.create(postId));
        }
        return RA.ok(post.val);
      }),
      RA.andThen(async ({ post, user, ctx, postId }) => {
        // Check if the user owns this post
        if (post.type !== 'local' || post.userId !== user.id) {
          return RA.err(UnauthorizedError.create());
        }

        // Resolve article if exists (Article is a child aggregate of Post)
        const articleResult = await articleResolverByRootPostId.resolve({ rootPostId: postId });
        const articleToDelete = articleResult.ok ? articleResult.val : undefined;

        // Delete article if exists
        if (articleToDelete) {
          const articleDeleteEvent = Article.deleteArticle(now)(articleToDelete.articleId);
          await articleDeletedStore.store(articleDeleteEvent);
        }

        // Delete the post via event store
        const deleteEvent = Post.deletePost(now)(postId);
        await postDeletedStore.store(deleteEvent);

        // Build Note URI for the Delete activity using Fedify context
        const noteUri = ctx.getObjectUri(Note, { identifier: user.username, id: postId });

        // Send Delete activity to followers
        await ctx.sendActivity(
          { identifier: user.username },
          'followers',
          new Delete({
            id: new URL(`#delete-${postId}`, noteUri),
            actor: ctx.getActorUri(user.username),
            object: new Tombstone({
              id: noteUri,
            }),
          }),
        );

        // If there was a published article, send Delete activity for it too
        if (articleToDelete && articleToDelete.status === 'published') {
          const articleUri = ctx.getObjectUri(FedifyArticle, {
            identifier: user.username,
            id: articleToDelete.articleId,
          });
          await ctx.sendActivity(
            { identifier: user.username },
            'followers',
            new Delete({
              id: new URL(`#delete-${articleToDelete.articleId}`, articleUri),
              actor: ctx.getActorUri(user.username),
              object: new Tombstone({
                id: articleUri,
              }),
            }),
          );
        }

        return RA.ok({ success: true });
      }),
    );

  return { run };
};

export const DeletePostUseCase = {
  create,
} as const;
