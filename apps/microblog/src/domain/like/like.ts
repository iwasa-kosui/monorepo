import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { LikeId } from './likeId.ts';

// LocalLike: ローカルユーザーが作成したいいね
const localLikeZodType = z.object({
  type: z.literal('local'),
  likeId: LikeId.zodType,
  actorId: ActorId.zodType,
  postId: PostId.zodType,
});

// RemoteLike: リモートサーバーから受信したいいね
const remoteLikeZodType = z.object({
  type: z.literal('remote'),
  likeId: LikeId.zodType,
  actorId: ActorId.zodType,
  postId: PostId.zodType,
  likeActivityUri: z.string(),
});

export type LocalLike = z.infer<typeof localLikeZodType>;
export const LocalLike = Schema.create(localLikeZodType);

export type RemoteLike = z.infer<typeof remoteLikeZodType>;
export const RemoteLike = Schema.create(remoteLikeZodType);

export type Like = LocalLike | RemoteLike;

const zodType = z.union([localLikeZodType, remoteLikeZodType]);
const schema = Schema.create(zodType);

export type LikeAggregateId = Readonly<{
  likeId: LikeId;
}>;
export type LikeAggregate = Agg.Aggregate<LikeAggregateId, 'like', Like>;

const toAggregateId = (like: Like): LikeAggregateId => ({
  likeId: like.likeId,
});

type LikeEvent<
  TAggregateState extends Agg.InferState<LikeAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<LikeAggregate, TAggregateState, TEventName, TEventPayload>;

export const LikeEvent = AggregateEvent.createFactory<LikeAggregate>('like');

// LocalLike events
export type LocalLikeCreated = LikeEvent<LocalLike, 'like.localLikeCreated', LocalLike>;
export type LocalLikeDeleted = LikeEvent<
  undefined,
  'like.localLikeDeleted',
  { likeId: LikeId }
>;

// RemoteLike events
export type RemoteLikeCreated = LikeEvent<RemoteLike, 'like.remoteLikeCreated', RemoteLike>;
export type RemoteLikeDeleted = LikeEvent<
  undefined,
  'like.remoteLikeDeleted',
  { likeId: LikeId; likeActivityUri: string }
>;

const createLocalLike = (payload: Omit<LocalLike, 'type'>, now: Instant): LocalLikeCreated => {
  const like: LocalLike = { ...payload, type: 'local' };
  return LikeEvent.create(
    toAggregateId(like),
    like,
    'like.localLikeCreated',
    like,
    now,
  );
};

const deleteLocalLike = (like: LocalLike, now: Instant): LocalLikeDeleted => {
  return LikeEvent.create(
    toAggregateId(like),
    undefined,
    'like.localLikeDeleted',
    { likeId: like.likeId },
    now,
  );
};

const createRemoteLike = (payload: Omit<RemoteLike, 'type'>, now: Instant): RemoteLikeCreated => {
  const like: RemoteLike = { ...payload, type: 'remote' };
  return LikeEvent.create(
    toAggregateId(like),
    like,
    'like.remoteLikeCreated',
    like,
    now,
  );
};

const deleteRemoteLike = (like: RemoteLike, now: Instant): RemoteLikeDeleted => {
  return LikeEvent.create(
    toAggregateId(like),
    undefined,
    'like.remoteLikeDeleted',
    { likeId: like.likeId, likeActivityUri: like.likeActivityUri },
    now,
  );
};

export type LocalLikeCreatedStore = Agg.Store<LocalLikeCreated>;
export type LocalLikeDeletedStore = Agg.Store<LocalLikeDeleted>;
export type RemoteLikeCreatedStore = Agg.Store<RemoteLikeCreated>;
export type RemoteLikeDeletedStore = Agg.Store<RemoteLikeDeleted>;

export type LikeResolver = Agg.Resolver<
  { actorId: ActorId; postId: PostId },
  Like | undefined
>;
export type LikesResolverByPostId = Agg.Resolver<{ postId: PostId }, Like[]>;
export type RemoteLikeResolverByActivityUri = Agg.Resolver<
  { likeActivityUri: string },
  RemoteLike | undefined
>;

export const Like = {
  ...schema,
  createLocalLike,
  deleteLocalLike,
  createRemoteLike,
  deleteRemoteLike,
  toAggregateId,
} as const;

// Error types
export type AlreadyLikedError = Readonly<{
  type: 'AlreadyLikedError';
  message: string;
  detail: {
    actorId: ActorId;
    postId: PostId;
  };
}>;

export const AlreadyLikedError = {
  create: ({
    actorId,
    postId,
  }: { actorId: ActorId; postId: PostId }): AlreadyLikedError => ({
    type: 'AlreadyLikedError',
    message: `The actor with ID "${actorId}" has already liked the post "${postId}".`,
    detail: { actorId, postId },
  }),
} as const;

export type NotLikedError = Readonly<{
  type: 'NotLikedError';
  message: string;
  detail: {
    postId: PostId;
  };
}>;

export const NotLikedError = {
  create: (postId: PostId): NotLikedError => ({
    type: 'NotLikedError',
    message: `No like found for post "${postId}"`,
    detail: { postId },
  }),
} as const;

export type LikeNotFoundError = Readonly<{
  type: 'LikeNotFoundError';
  message: string;
  detail: {
    likeActivityUri: string;
  };
}>;

export const LikeNotFoundError = {
  create: ({ likeActivityUri }: { likeActivityUri: string }): LikeNotFoundError => ({
    type: 'LikeNotFoundError',
    message: `The like activity "${likeActivityUri}" was not found.`,
    detail: { likeActivityUri },
  }),
} as const;
