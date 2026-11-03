import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Actor } from '../domain/actor/actor.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import { ImageId } from '../domain/image/imageId.ts';
import { type InvalidUploadImageError, UploadImage } from '../domain/image/uploadImage.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserNotFoundError } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { PostImageObjectStore } from '../ports/postImageObjectStore.ts';
import { resolveLocalActorWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId; bytes: Uint8Array }>;

type Err = UserNotFoundError | InvalidUploadImageError;

export type UpdateAvatarUseCase = UseCase<Input, LocalActor, Err>;

type Deps = Readonly<{
  actorResolverByUserId: ActorResolverByUserId;
  uploads: PostImageObjectStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  origin: string;
}>;

const create = ({ actorResolverByUserId, uploads, logoUriUpdatedStore, origin }: Deps): UpdateAvatarUseCase => {
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('actor', ({ userId }) => resolveLocalActor(userId)),
      RA.andBind('mimeType', ({ bytes }) => UploadImage.validate(bytes)),
      RA.bind('stored', ({ bytes, mimeType }) =>
        uploads.put({
          imageId: ImageId.generate(),
          body: bytes,
          contentType: mimeType,
          contentLength: bytes.byteLength,
        })),
      RA.bind('logoUri', ({ stored }) => new URL(stored.url, origin).href),
      RA.andThrough(({ actor, logoUri }) =>
        logoUriUpdatedStore.store(Actor.updateLogoUri(Instant.now())(actor, logoUri))
      ),
      RA.map(({ actor, logoUri }): LocalActor => ({ ...actor, logoUri })),
    );

  return { run };
};

export const UpdateAvatarUseCase = { create } as const;
