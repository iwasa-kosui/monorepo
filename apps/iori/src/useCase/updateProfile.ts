import type { RequestContext } from '@fedify/fedify';
import { PUBLIC_COLLECTION, Update } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';

import { Actor, type ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import { type InvalidLocalActorProfileError, LocalActorProfile } from '../domain/actor/localActorProfile.ts';
import type { LocalActorProfileUpdatedStore } from '../domain/actor/updateLocalActorProfile.ts';
import type { InvalidUploadImageError } from '../domain/image/uploadImage.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { buildLocalPerson } from './helper/localPerson.ts';
import { resolveLocalActorWith, resolveUserWith } from './helper/resolve.ts';
import type { UpdateAvatarUseCase } from './updateAvatar.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  displayName?: string;
  bio?: string;
  avatar?: Uint8Array;
  ctx: RequestContext<unknown>;
}>;

type Err = UserNotFoundError | InvalidUploadImageError | InvalidLocalActorProfileError;

export type UpdateProfileUseCase = UseCase<Input, LocalActor, Err>;

type Deps = Readonly<{
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  updateAvatarUseCase: UpdateAvatarUseCase;
  localActorProfileUpdatedStore: LocalActorProfileUpdatedStore;
}>;

const create = (
  { userResolver, actorResolverByUserId, updateAvatarUseCase, localActorProfileUpdatedStore }: Deps,
): UpdateProfileUseCase => {
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) => {
    const now = Instant.now();
    return RA.flow(
      RA.ok(input),
      RA.andBind('user', ({ userId }) => resolveUser(userId)),
      RA.andBind('actor', ({ userId }) => resolveLocalActor(userId)),
      RA.andBind('patch', ({ displayName, bio }) => LocalActorProfile.validate({ displayName, bio })),
      RA.andBind('avatarUpdated', ({ userId, avatar }) =>
        avatar === undefined
          ? RA.ok<LocalActor | undefined>(undefined)
          : updateAvatarUseCase.run({ userId, bytes: avatar })),
      RA.bind('base', ({ actor, avatarUpdated }): LocalActor => avatarUpdated ?? actor),
      RA.bind(
        'profileEvent',
        ({ base, patch }) =>
          Object.keys(patch).length === 0 ? undefined : Actor.updateLocalActorProfile(now)(base, patch),
      ),
      RA.andThrough(({ profileEvent }) =>
        profileEvent === undefined ? RA.ok(undefined) : localActorProfileUpdatedStore.store(profileEvent)
      ),
      RA.bind('updated', ({ base, profileEvent }): LocalActor => profileEvent?.aggregateState ?? base),
      RA.andThrough(async ({ user, updated, avatar, profileEvent, ctx }) => {
        if (avatar === undefined && profileEvent === undefined) return RA.ok(undefined);
        await ctx.sendActivity(
          { identifier: user.username },
          'followers',
          new Update({
            id: new URL(`#updates/${new Date(now).toISOString()}`, updated.uri),
            actor: ctx.getActorUri(user.username),
            object: await buildLocalPerson(ctx, user.username, updated),
            tos: [PUBLIC_COLLECTION],
            ccs: [ctx.getFollowersUri(user.username)],
          }),
        );
        return RA.ok(undefined);
      }),
      RA.map(({ updated }): LocalActor => updated),
    );
  };

  return { run };
};

export const UpdateProfileUseCase = { create } as const;
