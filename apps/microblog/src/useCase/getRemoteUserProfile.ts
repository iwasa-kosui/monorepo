import z from "zod/v4";
import { Schema } from "../helper/schema.ts";
import type { UseCase } from "./useCase.ts";
import { RA, Result } from "@iwasa-kosui/result";
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
  const run = async (input: Input): Promise<Result<Ok, Err>> => {
    const { actorId, currentUserActorId } = input;

    const actorResult = await actorResolverById.resolve(actorId);
    if (!actorResult.ok) {
      return actorResult;
    }

    const actor = actorResult.val;
    if (!actor) {
      return Result.err(RemoteActorNotFoundError.create(actorId));
    }
    if (actor.type !== 'remote') {
      return Result.err(NotRemoteActorError.create(actorId));
    }

    const remoteActor: RemoteActor = actor;

    let isFollowing = false;
    if (currentUserActorId) {
      const followResult = await followResolver.resolve({
        followerId: currentUserActorId,
        followingId: remoteActor.id,
      });
      if (followResult.ok) {
        isFollowing = followResult.val !== undefined;
      }
    }

    return Result.ok({ remoteActor, isFollowing });
  };

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
