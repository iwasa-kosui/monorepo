import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { sanitizeArticleBody } from '../adaptor/routes/helper/sanitizeArticleBody.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Article, type ArticleCreatedStore } from '../domain/article/article.ts';
import { ArticleBody, type ArticleBodyWrittenStore } from '../domain/articleBody/articleBody.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserNotFoundError } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { Schema } from '../helper/schema.ts';
import { resolveLocalActorWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  title: string;
  privateHtml: string;
  publicHtml: string;
}>;

const Ok = Schema.create(
  z.object({
    article: Article.zodType,
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = UserNotFoundError;

export type CreateArticleWithBodyUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverByUserId: ActorResolverByUserId;
  articleCreatedStore: ArticleCreatedStore;
  articleBodyWrittenStore: ArticleBodyWrittenStore;
}>;

const create = ({
  actorResolverByUserId,
  articleCreatedStore,
  articleBodyWrittenStore,
}: Deps): CreateArticleWithBodyUseCase => {
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('actor', ({ userId }) => resolveLocalActor(userId)),
      RA.andThen(async ({ actor, userId, title, privateHtml, publicHtml }) => {
        const now = Instant.now();
        const articleEvent = Article.createArticle(now)({
          authorActorId: actor.id,
          authorUserId: userId,
          rootPostId: null,
          title,
        });
        const bodyEvent = ArticleBody.writeArticleBody(now)({
          articleId: articleEvent.aggregateState.articleId,
          privateHtml: sanitizeArticleBody(privateHtml),
          publicHtml: sanitizeArticleBody(publicHtml),
        });
        await articleCreatedStore.store(articleEvent);
        await articleBodyWrittenStore.store(bodyEvent);
        return RA.ok({ article: articleEvent.aggregateState });
      }),
    );

  return { run };
};

export const CreateArticleWithBodyUseCase = {
  create,
} as const;
