import z from "zod";
import { Schema } from "../helper/schema.ts";
import { SessionId } from "../domain/session/sessionId.ts";
import { Post, type PostCreatedStore } from "../domain/post/post.ts";
import { SessionExpiredError, type SessionResolver } from "../domain/session/session.ts";
import { UserNotFoundError, type UserResolver } from "../domain/user/user.ts";
import type { UseCase } from "./useCase.ts";
import { Instant } from "../domain/instant/instant.ts";
import { RA } from "@iwasa-kosui/result";
import { type Context } from "@fedify/fedify";
import type { ActorResolverByUserId } from "../domain/actor/actor.ts";


type Input = Readonly<{
  sessionId: SessionId;
  content: string;
  context: Context<unknown>;
}>

const Ok = Schema.create(z.object({
  post: Post.zodType,
}))
type Ok = z.infer<typeof Ok.zodType>;

type Err = SessionExpiredError | UserNotFoundError;

export type CreatePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver
  postCreatedStore: PostCreatedStore
  userResolver: UserResolver
  actorResolverByUserId: ActorResolverByUserId
}>;

const create = ({
  sessionResolver,
  postCreatedStore,
  userResolver,
  actorResolverByUserId,
}: Deps): CreatePostUseCase => {
  const now = Instant.now();

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
      RA.bind('actor', ({ actor, user }) =>
        actor ? RA.ok(actor) : RA.err(UserNotFoundError.create({ userId: user.id }))
      ),
      RA.bind('content', ({ content }) => RA.ok(content)),
      RA.bind('postEvent', ({ actor, content }) => {
        const postEvent = Post.createPost(now)({
          actorId: actor.id,
          content,
          userId: actor.userId,
        });

        return RA.ok(postEvent);
      }),
      RA.andThrough(({ postEvent }) => postCreatedStore.store(postEvent)),
      RA.bind('post', ({ postEvent }) => RA.ok(postEvent.aggregateState)),
    );

  return { run };
}

export const CreatePostUseCase = {
  create,
} as const;
