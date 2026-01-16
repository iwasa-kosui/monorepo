import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import { type User, UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import type {
  Actor,
  ActorResolverByUserId,
  ActorsResolverByFollowerId,
  ActorsResolverByFollowingId,
} from './../domain/actor/actor.ts';
import type { PostsResolverByActorIds, PostWithAuthor } from './../domain/post/post.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  createdAt: Instant | undefined;
}>;

type Ok = Readonly<{
  user: User;
  posts: ReadonlyArray<PostWithAuthor>;
  actor: Actor;
  following: ReadonlyArray<Actor>;
  followers: ReadonlyArray<Actor>;
}>;

type Err = SessionExpiredError | UserNotFoundError;

export type GetTimelineUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  postsResolverByActorIds: PostsResolverByActorIds;
  actorsResolverByFollowerId: ActorsResolverByFollowerId;
  actorsResolverByFollowingId: ActorsResolverByFollowingId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  postsResolverByActorIds,
  actorsResolverByFollowerId,
  actorsResolverByFollowingId,
}: Deps): GetTimelineUseCase => {
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
      RA.andBind('following', ({ actor }) => actorsResolverByFollowerId.resolve(actor.id)),
      RA.andBind('followers', ({ actor }) => actorsResolverByFollowingId.resolve(actor.id)),
      RA.andBind('posts', async ({ actor, following }) => {
        const actorIds = [actor.id, ...following.map((a) => a.id)];
        return postsResolverByActorIds.resolve({
          actorIds,
          currentActorId: actor.id,
          createdAt: input.createdAt,
        });
      }),
    );

  return { run };
};

export const GetTimelineUseCase = {
  create,
} as const;
