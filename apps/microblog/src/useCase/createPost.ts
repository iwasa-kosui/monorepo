import z from "zod/v4";
import { Schema } from "../helper/schema.ts";
import { SessionId } from "../domain/session/sessionId.ts";
import { Post, type PostCreatedStore } from "../domain/post/post.ts";
import {
  SessionExpiredError,
  type SessionResolver,
} from "../domain/session/session.ts";
import {
  User,
  UserNotFoundError,
  type UserResolver,
} from "../domain/user/user.ts";
import type { UseCase } from "./useCase.ts";
import { Instant } from "../domain/instant/instant.ts";
import { RA } from "@iwasa-kosui/result";
import { Create, Note, type RequestContext } from "@fedify/fedify";
import type { Actor, ActorResolverByUserId } from "../domain/actor/actor.ts";
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from "./helper/resolve.ts";

type Input = Readonly<{
  sessionId: SessionId;
  content: string;
  ctx: RequestContext<unknown>;
}>;

const Ok = Schema.create(
  z.object({
    post: Post.zodType,
    user: User.zodType,
  })
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = SessionExpiredError | UserNotFoundError;

export type CreatePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  postCreatedStore: PostCreatedStore;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
}>;

const create = ({
  sessionResolver,
  postCreatedStore,
  userResolver,
  actorResolverByUserId,
}: Deps): CreatePostUseCase => {
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
      RA.andBind("postEvent", ({ actor, content }) => {

        const postEvent = Post.createPost(now)({
          actorId: actor.id,
          content,
          userId: actor.userId,
        });
        return RA.ok(postEvent);
      }),
      RA.andThrough(({ postEvent }) => postCreatedStore.store(postEvent)),
      RA.bind("post", ({ postEvent }) => postEvent.aggregateState),
      RA.andThrough(async ({ post, user, ctx }) => {
        const noteArgs = { identifier: user.username, id: post.postId };
        const note = await ctx.getObject(Note, noteArgs);
        await ctx.sendActivity(
          { identifier: user.username },
          "followers",
          new Create({
            id: new URL("#activity", note?.id ?? undefined),
            object: note,
            actors: note?.attributionIds,
            tos: note?.toIds,
            ccs: note?.ccIds,
          }),
        );
        return RA.ok(undefined);
      }),
      RA.map(({ post, user }) => ({ post, user })),
    );

  return { run };
};

export const CreatePostUseCase = {
  create,
} as const;
