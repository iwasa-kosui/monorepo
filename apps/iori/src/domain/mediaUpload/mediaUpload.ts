import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { MediaId } from './mediaId.ts';

export const MEDIA_DESCRIPTION_MAX_LENGTH = 1500;

const zodType = z
  .object({
    mediaId: MediaId.zodType,
    userId: UserId.zodType,
    url: z.string().min(1),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
    description: z.string().nullable(),
    createdAt: Instant.zodType,
  })
  .describe('MediaUpload');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type MediaUpload = z.output<typeof zodType>;

export type MediaUploadAggregateId = Readonly<{ mediaId: MediaId }>;
export type MediaUploadAggregate = Agg.Aggregate<MediaUploadAggregateId, 'mediaUpload', MediaUpload>;

const toAggregateId = (media: MediaUpload): MediaUploadAggregateId => ({ mediaId: media.mediaId });

type MediaUploadEvent<
  TAggregateState extends Agg.InferState<MediaUploadAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<MediaUploadAggregate, TAggregateState, TEventName, TEventPayload>;
const MediaUploadEvent = AggregateEvent.createFactory<MediaUploadAggregate>('mediaUpload');

export type InvalidMediaDescriptionError = Readonly<{
  type: 'InvalidMediaDescriptionError';
  message: string;
}>;

export const InvalidMediaDescriptionError = {
  create: (): InvalidMediaDescriptionError => ({
    type: 'InvalidMediaDescriptionError',
    message: `The description must be at most ${MEDIA_DESCRIPTION_MAX_LENGTH} characters`,
  }),
} as const;

export type MediaNotFoundError = Readonly<{
  type: 'MediaNotFoundError';
  message: string;
  detail: { mediaId: MediaId };
}>;

export const MediaNotFoundError = {
  create: (mediaId: MediaId): MediaNotFoundError => ({
    type: 'MediaNotFoundError',
    message: `The media "${mediaId}" was not found.`,
    detail: { mediaId },
  }),
} as const;

const normalizeDescription = (
  description: string | null | undefined,
): Result<string | null, InvalidMediaDescriptionError> => {
  if (description === null || description === undefined || description === '') return Result.ok(null);
  return [...description].length > MEDIA_DESCRIPTION_MAX_LENGTH
    ? Result.err(InvalidMediaDescriptionError.create())
    : Result.ok(description);
};

export type MediaUploadCreated = MediaUploadEvent<MediaUpload, 'mediaUpload.created', MediaUpload>;

const create = (
  input: Readonly<{
    mediaId: MediaId;
    userId: UserId;
    url: string;
    mimeType: MediaUpload['mimeType'];
    description: string | null | undefined;
  }>,
  now: Instant,
): Result<MediaUploadCreated, InvalidMediaDescriptionError> => {
  const description = normalizeDescription(input.description);
  if (!description.ok) return description;
  const media = schema.orThrow({ ...input, description: description.val, createdAt: now });
  return Result.ok(MediaUploadEvent.create(toAggregateId(media), media, 'mediaUpload.created', media, now));
};

export type MediaUploadDescriptionUpdated = MediaUploadEvent<
  MediaUpload,
  'mediaUpload.descriptionUpdated',
  Readonly<{ mediaId: MediaId; description: string | null }>
>;

const updateDescription = (
  media: MediaUpload,
  description: string | null | undefined,
  now: Instant,
): Result<MediaUploadDescriptionUpdated, InvalidMediaDescriptionError> => {
  const normalized = normalizeDescription(description);
  if (!normalized.ok) return normalized;
  const updated = schema.orThrow({ ...media, description: normalized.val });
  return Result.ok(
    MediaUploadEvent.create(
      toAggregateId(updated),
      updated,
      'mediaUpload.descriptionUpdated',
      { mediaId: updated.mediaId, description: normalized.val },
      now,
    ),
  );
};

export type MediaUploadCreatedStore = Agg.Store<MediaUploadCreated>;
export type MediaUploadDescriptionUpdatedStore = Agg.Store<MediaUploadDescriptionUpdated>;
export type MediaUploadResolver = Agg.Resolver<MediaId, MediaUpload | undefined>;

export const MediaUpload = {
  ...schema,
  normalizeDescription,
  create,
  updateDescription,
  toAggregateId,
} as const;
