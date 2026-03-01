import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { type ActorResolverById, PgActorResolverById } from '../adaptor/pg/actor/actorResolverById.ts';
import { PgFollowResolver } from '../adaptor/pg/follow/followResolver.ts';
import { PgMuteResolver } from '../adaptor/pg/mute/muteResolver.ts';
import { PgPostsResolverByActorIdWithPagination } from '../adaptor/pg/post/postsResolverByActorIdWithPagination.ts';
import { ActorId } from '../domain/actor/actorId.ts';
import type { RemoteActor } from '../domain/actor/remoteActor.ts';
import type { FollowResolver } from '../domain/follow/follow.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { MuteResolver } from '../domain/mute/mute.ts';
import type { PostsResolverByActorIdWithPagination, PostWithAuthor } from '../domain/post/post.ts';
import { UserId } from '../domain/user/userId.ts';
import { Schema } from '../helper/schema.ts';
import { singleton } from '../helper/singleton.ts';
import type { UseCase } from './useCase.ts';

const Input = Schema.create(
  z.object({
    actorId: ActorId.zodType,
    currentUserActorId: z.optional(ActorId.zodType),
    currentUserId: z.optional(UserId.zodType),
    createdAt: z.optional(Instant.zodType),
  }),
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
  isMuted: boolean;
  posts: ReadonlyArray<PostWithAuthor>;
}>;

type Err = RemoteActorNotFoundError | NotRemoteActorError;

export type GetRemoteActorPostsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverById: ActorResolverById;
  followResolver: FollowResolver;
  muteResolver: MuteResolver;
  postsResolverByActorIdWithPagination: PostsResolverByActorIdWithPagination;
}>;

const create = ({
  actorResolverById,
  followResolver,
  muteResolver,
  postsResolverByActorIdWithPagination,
}: Deps): GetRemoteActorPostsUseCase => {
  const run = async (input: Input): Promise<Result<Ok, Err>> => {
    const { actorId, currentUserActorId, currentUserId, createdAt } = input;

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

    let isMuted = false;
    if (currentUserId) {
      const muteResult = await muteResolver.resolve({
        userId: currentUserId,
        mutedActorId: remoteActor.id,
      });
      if (muteResult.ok) {
        isMuted = muteResult.val !== undefined;
      }
    }

    const postsResult = await postsResolverByActorIdWithPagination.resolve({
      actorId,
      currentActorId: currentUserActorId,
      createdAt,
    });

    if (!postsResult.ok) {
      return postsResult;
    }

    return Result.ok({ remoteActor, isFollowing, isMuted, posts: postsResult.val });
  };

  return {
    run,
  };
};

export const GetRemoteActorPostsUseCase = {
  create,
  getInstance: singleton(() =>
    create({
      actorResolverById: PgActorResolverById.getInstance(),
      followResolver: PgFollowResolver.getInstance(),
      muteResolver: PgMuteResolver.getInstance(),
      postsResolverByActorIdWithPagination: PgPostsResolverByActorIdWithPagination.getInstance(),
    })
  ),
} as const;
