import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { RepostId } from './repostId.ts';

const zodType = z
  .object({
    repostId: RepostId.zodType,
    actorId: ActorId.zodType,
    objectUri: z.string(),
    originalPostId: z.nullable(PostId.zodType),
    announceActivityUri: z.nullable(z.string()),
  })
  .describe('Repost');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type Repost = z.output<typeof zodType>;
export type RepostAggregateId = Readonly<{
  repostId: RepostId;
}>;
export type RepostAggregate = Agg.Aggregate<RepostAggregateId, 'repost', Repost>;
const toAggregateId = (repost: Repost): RepostAggregateId => ({
  repostId: repost.repostId,
});

type RepostEvent<
  TAggregateState extends Agg.InferState<RepostAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<RepostAggregate, TAggregateState, TEventName, TEventPayload>;
const RepostEvent = AggregateEvent.createFactory<RepostAggregate>('repost');

export type RepostCreated = RepostEvent<Repost, 'repost.repostCreated', Repost>;
export type RepostDeleted = RepostEvent<
  undefined,
  'repost.repostDeleted',
  { repostId: RepostId }
>;

const createRepost = (payload: Repost, now: Instant): RepostCreated => {
  return RepostEvent.create(
    toAggregateId(payload),
    payload,
    'repost.repostCreated',
    payload,
    now,
  );
};

const deleteRepost = (repost: Repost, now: Instant): RepostDeleted => {
  return RepostEvent.create(
    toAggregateId(repost),
    undefined,
    'repost.repostDeleted',
    { repostId: repost.repostId },
    now,
  );
};

export type RepostCreatedStore = Agg.Store<RepostCreated>;
export type RepostDeletedStore = Agg.Store<RepostDeleted>;
export type RepostResolverByActivityUri = Agg.Resolver<
  { announceActivityUri: string },
  Repost | undefined
>;
export type RepostResolver = Agg.Resolver<
  { actorId: ActorId; objectUri: string },
  Repost | undefined
>;
export type RepostsResolverByOriginalPostId = Agg.Resolver<
  { originalPostId: PostId },
  Repost[]
>;

export const Repost = {
  ...schema,
  createRepost,
  deleteRepost,
  toAggregateId,
} as const;

export type AlreadyRepostedError = Readonly<{
  type: 'AlreadyRepostedError';
  message: string;
  detail: {
    actorId: ActorId;
    objectUri: string;
  };
}>;

export const AlreadyRepostedError = {
  create: ({
    actorId,
    objectUri,
  }: { actorId: ActorId; objectUri: string }): AlreadyRepostedError => ({
    type: 'AlreadyRepostedError',
    message: `The actor with ID "${actorId}" has already reposted the object "${objectUri}".`,
    detail: { actorId, objectUri },
  }),
} as const;

export type RepostNotFoundError = Readonly<{
  type: 'RepostNotFoundError';
  message: string;
  detail: {
    announceActivityUri: string;
  };
}>;

export const RepostNotFoundError = {
  create: ({ announceActivityUri }: { announceActivityUri: string }): RepostNotFoundError => ({
    type: 'RepostNotFoundError',
    message: `The repost with activity URI "${announceActivityUri}" was not found.`,
    detail: { announceActivityUri },
  }),
} as const;
