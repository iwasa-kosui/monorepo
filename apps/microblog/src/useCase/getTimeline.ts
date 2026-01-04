import type { ActorResolverByUserId } from "./../domain/actor/actor.ts";
import type { Post, PostsResolverByActorId } from "./../domain/post/post.ts";
import { RA } from "@iwasa-kosui/result";
import {
  SessionExpiredError,
  type SessionResolver,
} from "../domain/session/session.ts";
import type { SessionId } from "../domain/session/sessionId.ts";
import {
  UserNotFoundError,
  type User,
  type UserResolver,
} from "../domain/user/user.ts";
import type { UseCase } from "./useCase.ts";
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from "./helper/resolve.ts";
import { Instant } from "../domain/instant/instant.ts";

type Input = Readonly<{
  sessionId: SessionId;
}>;

type Ok = Readonly<{
  user: User;
  posts: ReadonlyArray<Post>;
}>;

type Err = SessionExpiredError | UserNotFoundError;

export type GetTimelineUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  postsResolverByActorId: PostsResolverByActorId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  postsResolverByActorId,
}: Deps): GetTimelineUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.bind("session", ({ sessionId }) => resolveSession(sessionId)),
      RA.bind("user", ({ session }) => resolveUser(session.userId)),
      RA.bind("actor", ({ user }) => resolveLocalActor(user.id)),
      RA.bind("posts", async ({ actor }) =>
        postsResolverByActorId.resolve(actor.id)
      ),
      RA.map(({ user, posts }) => ({
        user,
        posts,
      }))
    );

  return { run };
};

export const GetTimelineUseCase = {
  create,
} as const;
