import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { LikedPostsResolverByActorId, PostWithAuthor } from '../domain/post/post.ts';
import type {
  SessionExpiredError,
  SessionResolver,
  SessionWithUserAndActorResolver,
} from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { User, UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { composeSessionWithUserAndActorResolver, resolveSessionWithUserAndActorWith } from './helper/resolve.ts';
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
  sessionWithUserAndActorResolver?: SessionWithUserAndActorResolver;
  likedPostsResolver: LikedPostsResolverByActorId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  sessionWithUserAndActorResolver,
  likedPostsResolver,
}: Deps): GetLikedPostsUseCase => {
  const now = Instant.now();
  const resolveSessionUserActor = resolveSessionWithUserAndActorWith(
    sessionWithUserAndActorResolver
      ?? composeSessionWithUserAndActorResolver(sessionResolver, userResolver, actorResolverByUserId),
    now,
  );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('resolved', ({ sessionId }) => resolveSessionUserActor(sessionId)),
      RA.map(({ resolved, ...rest }) => ({ ...rest, ...resolved })),
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
