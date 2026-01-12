import type { ActorResolverByUserId, ActorsResolverByFollowerId } from "./../domain/actor/actor.ts";
import type { Post, PostsResolverByActorId, PostsResolverByActorIds } from "./../domain/post/post.ts";
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
import type { Username } from "../domain/user/username.ts";

type Input = Readonly<{
  sessionId: SessionId;
}>;

type Ok = Readonly<{
  user: User;
  posts: ReadonlyArray<Post & { username: Username }>;
}>;

type Err = SessionExpiredError | UserNotFoundError;

export type GetTimelineUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  postsResolverByActorIds: PostsResolverByActorIds;
  actorsResolverByFollowerId: ActorsResolverByFollowerId
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  postsResolverByActorIds,
  actorsResolverByFollowerId,
}: Deps): GetTimelineUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind("session", ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind("user", ({ session }) => resolveUser(session.userId)),
      RA.andBind("actor", ({ user }) => resolveLocalActor(user.id)),
      RA.andBind("following", ({ actor }) => actorsResolverByFollowerId.resolve(actor.id)),
      RA.andBind("posts", async ({ actor, following }) => {
        const actorIds = [actor.id, ...following.map((a) => a.id)];
        return postsResolverByActorIds.resolve(actorIds);
      }),
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
