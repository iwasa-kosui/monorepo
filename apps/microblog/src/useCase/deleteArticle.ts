import type { RequestContext } from '@fedify/fedify';
import { Article as FedifyArticle, Delete, Tombstone } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  Article,
  type ArticleDeletedStore,
  ArticleNotFoundError,
  type ArticleResolver,
} from '../domain/article/article.ts';
import { ArticleId } from '../domain/article/articleId.ts';
import { Instant } from '../domain/instant/instant.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import { SessionId } from '../domain/session/sessionId.ts';
import { UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  articleId: ArticleId;
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
    message: 'You are not authorized to delete this article.',
  }),
} as const;

type Err = SessionExpiredError | UserNotFoundError | ArticleNotFoundError | UnauthorizedError;

export type DeleteArticleUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  articleResolver: ArticleResolver;
  articleDeletedStore: ArticleDeletedStore;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  articleResolver,
  articleDeletedStore,
}: Deps): DeleteArticleUseCase => {
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
      RA.andBind('existingArticle', async ({ articleId }) => {
        const article = await articleResolver.resolve(articleId);
        if (!article.ok) {
          return article;
        }
        if (article.val === undefined) {
          return RA.err(ArticleNotFoundError.create(articleId));
        }
        return RA.ok(article.val);
      }),
      RA.andThen(async ({ existingArticle, user, ctx, articleId }) => {
        if (existingArticle.authorUserId !== user.id) {
          return RA.err(UnauthorizedError.create());
        }

        const deleteEvent = Article.deleteArticle(now)(articleId);
        await articleDeletedStore.store(deleteEvent);

        if (existingArticle.status === 'published') {
          const articleUri = ctx.getObjectUri(FedifyArticle, {
            identifier: user.username,
            id: existingArticle.articleId,
          });
          await ctx.sendActivity(
            { identifier: user.username },
            'followers',
            new Delete({
              id: new URL(`#delete-${existingArticle.articleId}`, articleUri),
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

export const DeleteArticleUseCase = {
  create,
} as const;
