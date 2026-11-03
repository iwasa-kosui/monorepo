import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { MediaId } from '../domain/mediaUpload/mediaId.ts';
import {
  type InvalidMediaDescriptionError,
  type MediaNotFoundError,
  MediaUpload,
  type MediaUploadDescriptionUpdatedStore,
  type MediaUploadResolver,
} from '../domain/mediaUpload/mediaUpload.ts';
import type { UserId } from '../domain/user/userId.ts';
import { resolveOwnedMediaUpload } from './getMediaUpload.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  mediaId: MediaId;
  description: string | null | undefined;
}>;

type Err = MediaNotFoundError | InvalidMediaDescriptionError;

export type UpdateMediaDescriptionUseCase = UseCase<Input, MediaUpload, Err>;

type Deps = Readonly<{
  mediaUploadResolver: MediaUploadResolver;
  mediaUploadDescriptionUpdatedStore: MediaUploadDescriptionUpdatedStore;
}>;

const create = ({ mediaUploadResolver, mediaUploadDescriptionUpdatedStore }: Deps): UpdateMediaDescriptionUseCase => {
  const resolveOwned = resolveOwnedMediaUpload(mediaUploadResolver);

  const run = async (input: Input) =>
    RA.flow(
      resolveOwned(input),
      RA.andBind('updated', (media) => MediaUpload.updateDescription(media, input.description, Instant.now())),
      RA.andThrough(({ updated }) => mediaUploadDescriptionUpdatedStore.store(updated)),
      RA.map(({ updated }) => updated.aggregateState),
    );

  return { run };
};

export const UpdateMediaDescriptionUseCase = { create } as const;
