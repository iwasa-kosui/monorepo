import { RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Article, type ArticlesResolverByAuthorActorId } from '../domain/article/article.ts';
import { Instant } from '../domain/instant/instant.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import { SessionId } from '../domain/session/sessionId.ts';
import { UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
}>;

const Ok = Schema.create(
  z.object({
    articles: z.array(Article.zodType),
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = SessionExpiredError | UserNotFoundError;

export type GetArticlesUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  articlesResolverByAuthorActorId: ArticlesResolverByAuthorActorId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  articlesResolverByAuthorActorId,
}: Deps): GetArticlesUseCase => {
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
      RA.andThen(async ({ actor }): Promise<Result<Ok, Err>> => {
        const articlesResult = await articlesResolverByAuthorActorId.resolve({ actorId: actor.id });
        if (!articlesResult.ok) {
          return articlesResult;
        }
        // Sort by createdAt descending
        const sortedArticles = articlesResult.val.sort(
          (a, b) => b.createdAt - a.createdAt,
        );
        return RA.ok({ articles: sortedArticles });
      }),
    );

  return { run };
};

export const GetArticlesUseCase = {
  create,
} as const;
