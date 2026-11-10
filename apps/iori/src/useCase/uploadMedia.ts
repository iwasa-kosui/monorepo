import { RA } from '@iwasa-kosui/result';

import { ImageId } from '../domain/image/imageId.ts';
import { type InvalidUploadImageError, UploadImage } from '../domain/image/uploadImage.ts';
import { Instant } from '../domain/instant/instant.ts';
import { MediaId } from '../domain/mediaUpload/mediaId.ts';
import {
  type InvalidMediaDescriptionError,
  MediaUpload,
  type MediaUploadCreatedStore,
} from '../domain/mediaUpload/mediaUpload.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { PostImageObjectStore } from '../ports/postImageObjectStore.ts';
import { resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  bytes: Uint8Array;
  description: string | null | undefined;
}>;

type Err = UserNotFoundError | InvalidUploadImageError | InvalidMediaDescriptionError;

export type UploadMediaUseCase = UseCase<Input, MediaUpload, Err>;

type Deps = Readonly<{
  userResolver: UserResolver;
  uploads: PostImageObjectStore;
  mediaUploadCreatedStore: MediaUploadCreatedStore;
  origin: string;
}>;

const create = ({ userResolver, uploads, mediaUploadCreatedStore, origin }: Deps): UploadMediaUseCase => {
  const resolveUser = resolveUserWith(userResolver);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', ({ userId }) => resolveUser(userId)),
      RA.andBind('mimeType', ({ bytes }) => UploadImage.validate(bytes)),
      // R2 に置く前に検査し、不正な説明で残骸を作らない
      RA.andBind('normalizedDescription', ({ description }) => MediaUpload.normalizeDescription(description)),
      RA.bind('mediaId', () => MediaId.generate()),
      RA.bind('stored', ({ bytes, mimeType, mediaId }) =>
        uploads.put({
          imageId: ImageId.orThrow(mediaId),
          body: bytes,
          contentType: mimeType,
          contentLength: bytes.byteLength,
        })),
      RA.andBind('created', ({ user, mediaId, stored, mimeType, normalizedDescription }) =>
        MediaUpload.create(
          {
            mediaId,
            userId: user.id,
            url: new URL(stored.url, origin).href,
            mimeType,
            description: normalizedDescription,
          },
          Instant.now(),
        )),
      RA.andThrough(({ created }) => mediaUploadCreatedStore.store(created)),
      RA.map(({ created }) => created.aggregateState),
    );

  return { run };
};

export const UploadMediaUseCase = { create } as const;
