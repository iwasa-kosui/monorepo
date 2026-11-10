import type { RequestContext } from '@fedify/fedify';
import { Article as FedifyArticle, Create } from '@fedify/vocab';
import { RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  Article,
  ArticleBodyMissingError,
  ArticleInvalidStatusError,
  ArticleNotFoundError,
  type ArticlePublishedStore,
  type ArticleResolver,
} from '../domain/article/article.ts';
import { ArticleId } from '../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../domain/articleBody/articleBody.ts';
import {
  type DigestResolverByArticleId,
  DigestSummaryNotPublishableError,
  SUMMARY_DIGEST_TOPIC_KEY,
} from '../domain/digest/digest.ts';
import { Instant } from '../domain/instant/instant.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import { UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
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
  | ArticleInvalidStatusError
  | DigestSummaryNotPublishableError
  | ArticleBodyMissingError;

export type PublishArticleUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  articleResolver: ArticleResolver;
  articlePublishedStore: ArticlePublishedStore;
  articleBodyResolver: ArticleBodyResolver;
  digestResolverByArticleId: DigestResolverByArticleId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  articleResolver,
  articlePublishedStore,
  articleBodyResolver,
  digestResolverByArticleId,
}: Deps): PublishArticleUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input): Promise<Result<Ok, Err>> =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (input) => resolveRequesterUser(input)),
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

        const digest = await digestResolverByArticleId.resolve(existingArticle.articleId);
        if (!digest.ok) {
          return digest;
        }
        if (digest.val?.topicKey === SUMMARY_DIGEST_TOPIC_KEY && digest.val.items.length === 0) {
          return RA.err(DigestSummaryNotPublishableError.create(existingArticle.articleId));
        }

        if (existingArticle.rootPostId === null) {
          const body = await articleBodyResolver.resolve(existingArticle.articleId);
          if (!body.ok) {
            return body;
          }
          if (body.val === undefined) {
            return RA.err(ArticleBodyMissingError.create(existingArticle.articleId));
          }
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
