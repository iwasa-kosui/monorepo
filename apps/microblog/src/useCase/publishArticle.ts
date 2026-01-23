import type { RequestContext } from '@fedify/fedify';
import { Article as FedifyArticle, Create } from '@fedify/fedify';
import { RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  Article,
  ArticleInvalidStatusError,
  ArticleNotFoundError,
  type ArticlePublishedStore,
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
    article: Article.zodType,
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
    message: 'You are not authorized to publish this article.',
  }),
} as const;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | ArticleNotFoundError
  | UnauthorizedError
  | ArticleInvalidStatusError;

export type PublishArticleUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  articleResolver: ArticleResolver;
  articlePublishedStore: ArticlePublishedStore;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  articleResolver,
  articlePublishedStore,
}: Deps): PublishArticleUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input): Promise<Result<Ok, Err>> =>
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
      RA.andThen(async ({ existingArticle, user, ctx }): Promise<Result<Ok, Err>> => {
        if (existingArticle.authorUserId !== user.id) {
          return RA.err(UnauthorizedError.create());
        }

        if (existingArticle.status !== 'draft' && existingArticle.status !== 'unpublished') {
          return RA.err(
            ArticleInvalidStatusError.create(existingArticle.articleId, existingArticle.status, [
              'draft',
              'unpublished',
            ]),
          );
        }

        const publishEvent = Article.publishArticle(now)(existingArticle);
        await articlePublishedStore.store(publishEvent);

        const articleArgs = { identifier: user.username, id: existingArticle.articleId };
        const articleObject = await ctx.getObject(FedifyArticle, articleArgs);
        if (articleObject) {
          await ctx.sendActivity(
            { identifier: user.username },
            'followers',
            new Create({
              id: new URL('#activity', articleObject.id ?? undefined),
              object: articleObject,
              actors: articleObject.attributionIds,
              tos: articleObject.toIds,
              ccs: articleObject.ccIds,
            }),
          );
        }

        return RA.ok({ article: publishEvent.aggregateState });
      }),
    );

  return { run };
};

export const PublishArticleUseCase = {
  create,
} as const;
