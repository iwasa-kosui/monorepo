import { RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  Article,
  ArticleAlreadyExistsError,
  type ArticleCreatedStore,
  type ArticleResolverByRootPostId,
} from '../domain/article/article.ts';
import { Instant } from '../domain/instant/instant.ts';
import { PostNotFoundError, type PostResolver } from '../domain/post/post.ts';
import { PostId } from '../domain/post/postId.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import { SessionId } from '../domain/session/sessionId.ts';
import { UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  rootPostId: PostId;
  title: string;
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
    message: 'You are not authorized to create an article for this post.',
  }),
} as const;

type Err = SessionExpiredError | UserNotFoundError | PostNotFoundError | UnauthorizedError | ArticleAlreadyExistsError;

export type CreateArticleUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  postResolver: PostResolver;
  articleResolverByRootPostId: ArticleResolverByRootPostId;
  articleCreatedStore: ArticleCreatedStore;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  postResolver,
  articleResolverByRootPostId,
  articleCreatedStore,
}: Deps): CreateArticleUseCase => {
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
      RA.andBind('post', async ({ rootPostId }) => {
        const post = await postResolver.resolve(rootPostId);
        if (!post.ok) {
          return post;
        }
        if (post.val === undefined) {
          return RA.err(PostNotFoundError.create(rootPostId));
        }
        return RA.ok(post.val);
      }),
      RA.andThen(async ({ post, user, actor, rootPostId, title }): Promise<Result<Ok, Err>> => {
        if (post.type !== 'local' || post.userId !== user.id) {
          return RA.err(UnauthorizedError.create());
        }

        const existingArticle = await articleResolverByRootPostId.resolve({ rootPostId });
        if (!existingArticle.ok) {
          return existingArticle;
        }
        if (existingArticle.val !== undefined) {
          return RA.err(ArticleAlreadyExistsError.create(rootPostId));
        }

        const articleEvent = Article.createArticle(now)({
          authorActorId: actor.id,
          authorUserId: user.id,
          rootPostId,
          title,
        });
        await articleCreatedStore.store(articleEvent);
        return RA.ok({ article: articleEvent.aggregateState });
      }),
    );

  return { run };
};

export const CreateArticleUseCase = {
  create,
} as const;
