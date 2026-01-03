import type { ActorResolverByUserId } from './../domain/actor/actor.ts';
import type { Post, PostsResolverByActorId } from './../domain/post/post.ts';
import { RA } from "@iwasa-kosui/result";
import { SessionExpiredError, type SessionResolver } from "../domain/session/session.ts";
import type { SessionId } from "../domain/session/sessionId.ts";
import { UserNotFoundError, type User, type UserResolver } from "../domain/user/user.ts";
import type { UseCase } from "./useCase.ts";

type Input = Readonly<{
  sessionId: SessionId;
}>;

type Ok = Readonly<{
  user: User;
  posts: ReadonlyArray<Post>;
}>;

type Err = SessionExpiredError | UserNotFoundError

export type GetTimelineUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver
  userResolver: UserResolver
  actorResolverByUserId: ActorResolverByUserId
  postsResolverByActorId: PostsResolverByActorId
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  postsResolverByActorId,
}: Deps): GetTimelineUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.bind('session', async ({ sessionId }) =>
        sessionResolver.resolve(sessionId)
      ),
      RA.bind('session', ({ session, sessionId }) =>
        session ? RA.ok(session) : RA.err(SessionExpiredError.create(sessionId))
      ),
      RA.bind('user', async ({ session }) =>
        userResolver.resolve(session.userId)
      ),
      RA.bind('user', ({ user, session }) =>
        user ? RA.ok(user) : RA.err(UserNotFoundError.create({ userId: session.userId }))
      ),
      RA.bind('actor', async ({ user }) =>
        actorResolverByUserId.resolve(user.id)
      ),
      RA.bind('actor', ({ actor, user }) => {
        if (!actor) {
          return RA.err(UserNotFoundError.create({ userId: user.id }));
        }
        return RA.ok(actor);
      }),
      RA.bind('posts', async ({ actor }) =>
        postsResolverByActorId.resolve(actor.id)
      ),
      RA.map(({ user, posts }) => ({
        user,
        posts,
      })),
    );

  return { run };
}

export const GetTimelineUseCase = {
  create,
} as const;
