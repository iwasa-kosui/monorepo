import z from "zod/v4";
import { Schema } from "../helper/schema.ts";
import type { UseCase } from "./useCase.ts";
import { RA } from "@iwasa-kosui/result";
import { ActorId } from "../domain/actor/actorId.ts";
import type { RemoteActor } from "../domain/actor/remoteActor.ts";
import type { FollowResolver } from "../domain/follow/follow.ts";
import { singleton } from "../helper/singleton.ts";
import { PgActorResolverById, type ActorResolverById } from "../adaptor/pg/actor/actorResolverById.ts";
import { PgFollowResolver } from "../adaptor/pg/follow/followResolver.ts";

const Input = Schema.create(
  z.object({
    actorId: ActorId.zodType,
    currentUserActorId: z.optional(ActorId.zodType),
  })
);
type Input = z.infer<typeof Input.zodType>;

type RemoteActorNotFoundError = Readonly<{
  type: 'RemoteActorNotFoundError';
  message: string;
  detail: { actorId: ActorId };
}>;

const RemoteActorNotFoundError = {
  create: (actorId: ActorId): RemoteActorNotFoundError => ({
    type: 'RemoteActorNotFoundError',
    message: `Remote actor with ID "${actorId}" was not found.`,
    detail: { actorId },
  }),
};

type NotRemoteActorError = Readonly<{
  type: 'NotRemoteActorError';
  message: string;
  detail: { actorId: ActorId };
}>;

const NotRemoteActorError = {
  create: (actorId: ActorId): NotRemoteActorError => ({
    type: 'NotRemoteActorError',
    message: `Actor with ID "${actorId}" is not a remote actor.`,
    detail: { actorId },
  }),
};

type Ok = Readonly<{
  remoteActor: RemoteActor;
  isFollowing: boolean;
}>;

type Err = RemoteActorNotFoundError | NotRemoteActorError;

export type GetRemoteUserProfileUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverById: ActorResolverById;
  followResolver: FollowResolver;
}>;

const create = ({
  actorResolverById,
  followResolver,
}: Deps): GetRemoteUserProfileUseCase => {
  const run = (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind("actor", ({ actorId }) => actorResolverById.resolve(actorId)),
      RA.andBind("remoteActor", ({ actor, actorId }) => {
        if (!actor) {
          return RA.err(RemoteActorNotFoundError.create(actorId));
        }
        if (actor.type !== 'remote') {
          return RA.err(NotRemoteActorError.create(actorId));
        }
        return RA.ok(actor);
      }),
      RA.andBind("isFollowing", async ({ remoteActor, currentUserActorId }) => {
        if (!currentUserActorId) {
          return RA.ok(false);
        }
        const followResult = await followResolver.resolve({
          followerId: currentUserActorId,
          followingId: remoteActor.id,
        });
        return RA.map(followResult, (follow) => follow !== undefined);
      }),
      RA.map(({ remoteActor, isFollowing }) => ({ remoteActor, isFollowing }))
    );

  return {
    run,
  };
};

export const GetRemoteUserProfileUseCase = {
  create,
  getInstance: singleton(() =>
    create({
      actorResolverById: PgActorResolverById.getInstance(),
      followResolver: PgFollowResolver.getInstance(),
    })
  ),
} as const;
