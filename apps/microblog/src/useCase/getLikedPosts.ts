import { RA } from '@iwasa-kosui/result';

import type { LikedPostsResolverByActorId } from '../adaptor/pg/like/likedPostsResolverByActorId.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { PostWithAuthor } from '../domain/post/post.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { User, UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  createdAt?: Instant;
}>;

type Ok = Readonly<{
  user: User;
  posts: ReadonlyArray<PostWithAuthor>;
}>;

type Err = SessionExpiredError | UserNotFoundError;

export type GetLikedPostsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  likedPostsResolver: LikedPostsResolverByActorId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  likedPostsResolver,
}: Deps): GetLikedPostsUseCase => {
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
      RA.andBind('posts', ({ actor }) =>
        likedPostsResolver.resolve({
          actorId: actor.id,
          currentActorId: actor.id,
          createdAt: input.createdAt,
        })),
      RA.map(({ user, posts }) => ({ user, posts })),
    );

  return { run };
};

export const GetLikedPostsUseCase = {
  create,
} as const;
