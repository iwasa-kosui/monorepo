import type { RequestContext } from '@fedify/fedify';
import { PUBLIC_COLLECTION, Update } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';

import { Actor, type ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import { type InvalidLocalActorProfileError, LocalActorProfile } from '../domain/actor/localActorProfile.ts';
import type { LocalActorProfileUpdatedStore } from '../domain/actor/updateLocalActorProfile.ts';
import { type InvalidUploadImageError, UploadImage } from '../domain/image/uploadImage.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { buildLocalPerson } from './helper/localPerson.ts';
import { resolveLocalActorWith, resolveUserWith } from './helper/resolve.ts';
import type { UpdateAvatarUseCase } from './updateAvatar.ts';
import type { UpdateHeaderUseCase } from './updateHeader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  displayName?: string;
  bio?: string;
  avatar?: Uint8Array;
  /** null のときはヘッダー画像を未設定に戻す */
  header?: Uint8Array | null;
  ctx: RequestContext<unknown>;
}>;

type Err = UserNotFoundError | InvalidUploadImageError | InvalidLocalActorProfileError;

export type UpdateProfileUseCase = UseCase<Input, LocalActor, Err>;

type Deps = Readonly<{
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  updateAvatarUseCase: UpdateAvatarUseCase;
  updateHeaderUseCase: UpdateHeaderUseCase;
  localActorProfileUpdatedStore: LocalActorProfileUpdatedStore;
}>;

const create = (
  { userResolver, actorResolverByUserId, updateAvatarUseCase, updateHeaderUseCase, localActorProfileUpdatedStore }:
    Deps,
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
      // ヘッダーが不正なときに、アバターだけ保存されて終わらないよう先に確かめる
      RA.andThrough(({ header }) =>
        header === undefined || header === null ? RA.ok(undefined) : UploadImage.validate(header)
      ),
      RA.andBind('avatarUpdated', ({ userId, avatar }) =>
        avatar === undefined
          ? RA.ok<LocalActor | undefined>(undefined)
          : updateAvatarUseCase.run({ userId, bytes: avatar })),
      // アバターを保存したあとのアクターを読み直すので、ヘッダーの結果はアバターの変更も含む
      RA.andBind('headerUpdated', ({ userId, header }) =>
        header === undefined
          ? RA.ok<LocalActor | undefined>(undefined)
          : updateHeaderUseCase.run({ userId, bytes: header })),
      RA.bind(
        'base',
        ({ actor, avatarUpdated, headerUpdated }): LocalActor => headerUpdated ?? avatarUpdated ?? actor,
      ),
      RA.bind(
        'imageChanged',
        ({ actor, base }) => base.logoUri !== actor.logoUri || base.headerUri !== actor.headerUri,
      ),
      RA.bind(
        'profileEvent',
        ({ base, patch }) =>
          Object.keys(patch).length === 0 ? undefined : Actor.updateLocalActorProfile(now)(base, patch),
      ),
      RA.andThrough(({ profileEvent }) =>
        profileEvent === undefined ? RA.ok(undefined) : localActorProfileUpdatedStore.store(profileEvent)
      ),
      RA.bind('updated', ({ base, profileEvent }): LocalActor => profileEvent?.aggregateState ?? base),
      RA.andThrough(async ({ user, updated, imageChanged, profileEvent, ctx }) => {
        if (!imageChanged && profileEvent === undefined) return RA.ok(undefined);
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
