import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Actor } from '../domain/actor/actor.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import type { HeaderUriUpdatedStore } from '../domain/actor/updateHeaderUri.ts';
import { ImageId } from '../domain/image/imageId.ts';
import { stripImageMetadata } from '../domain/image/stripImageMetadata.ts';
import { type InvalidUploadImageError, UploadImage } from '../domain/image/uploadImage.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserNotFoundError } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { PostImageObjectStore } from '../ports/postImageObjectStore.ts';
import { resolveLocalActorWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

/** bytes が null のときはヘッダー画像を未設定に戻す */
type Input = Readonly<{ userId: UserId; bytes: Uint8Array | null }>;

type Err = UserNotFoundError | InvalidUploadImageError;

export type UpdateHeaderUseCase = UseCase<Input, LocalActor, Err>;

type Deps = Readonly<{
  actorResolverByUserId: ActorResolverByUserId;
  uploads: PostImageObjectStore;
  headerUriUpdatedStore: HeaderUriUpdatedStore;
  origin: string;
}>;

const create = ({ actorResolverByUserId, uploads, headerUriUpdatedStore, origin }: Deps): UpdateHeaderUseCase => {
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const upload = (bytes: Uint8Array): RA<string, InvalidUploadImageError> =>
    RA.flow(
      RA.ok(bytes),
      RA.andThen((body) => UploadImage.validate(body)),
      RA.map((mimeType) => {
        // 位置情報などのメタデータを残したまま公開しない
        const body = stripImageMetadata(bytes);
        return uploads.put({
          imageId: ImageId.generate(),
          body,
          contentType: mimeType,
          contentLength: body.byteLength,
        });
      }),
      RA.map((stored) => new URL(stored.url, origin).href),
    );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('actor', ({ userId }) => resolveLocalActor(userId)),
      RA.andBind(
        'headerUri',
        ({ bytes }) => bytes === null ? RA.ok<string | undefined>(undefined) : upload(bytes),
      ),
      RA.bind('event', ({ actor, headerUri }) => Actor.updateHeaderUri(Instant.now())(actor, headerUri)),
      RA.andThrough(({ actor, headerUri, event }) =>
        // もともと未設定のヘッダーを消そうとしたときは、何も変わらないのでイベントを残さない
        actor.headerUri === undefined && headerUri === undefined
          ? RA.ok(undefined)
          : headerUriUpdatedStore.store(event)
      ),
      RA.map(({ event }): LocalActor => event.aggregateState),
    );

  return { run };
};

export const UpdateHeaderUseCase = { create } as const;
