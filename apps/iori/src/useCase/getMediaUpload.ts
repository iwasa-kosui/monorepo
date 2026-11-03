import { RA } from '@iwasa-kosui/result';

import type { MediaId } from '../domain/mediaUpload/mediaId.ts';
import { MediaNotFoundError, type MediaUpload, type MediaUploadResolver } from '../domain/mediaUpload/mediaUpload.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId; mediaId: MediaId }>;

export type GetMediaUploadUseCase = UseCase<Input, MediaUpload, MediaNotFoundError>;

type Deps = Readonly<{ mediaUploadResolver: MediaUploadResolver }>;

// 他人のメディアの存在を知らせないため、持ち主が違う場合も未存在と同じ扱いにする
export const resolveOwnedMediaUpload = (mediaUploadResolver: MediaUploadResolver) => (input: Input) =>
  RA.flow(
    mediaUploadResolver.resolve(input.mediaId),
    RA.andThen((media) =>
      media !== undefined && media.userId === input.userId
        ? RA.ok(media)
        : RA.err(MediaNotFoundError.create(input.mediaId))
    ),
  );

const create = ({ mediaUploadResolver }: Deps): GetMediaUploadUseCase => ({
  run: resolveOwnedMediaUpload(mediaUploadResolver),
});

export const GetMediaUploadUseCase = { create } as const;
