import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { PostWithAuthor } from '../post/post.ts';
import { PostId } from '../post/postId.ts';
import { RepostId } from '../repost/repostId.ts';
import { TimelineItemId } from './timelineItemId.ts';

export const TimelineItemType = {
  Post: 'post',
  Repost: 'repost',
} as const;
export type TimelineItemType = (typeof TimelineItemType)[keyof typeof TimelineItemType];

const zodType = z
  .object({
    timelineItemId: TimelineItemId.zodType,
    type: z.enum(['post', 'repost']),
    actorId: ActorId.zodType,
    postId: PostId.zodType,
    repostId: z.nullable(RepostId.zodType),
    createdAt: z.number(),
  })
  .describe('TimelineItem');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type TimelineItem = z.output<typeof zodType>;
export type TimelineItemAggregateId = Readonly<{
  timelineItemId: TimelineItemId;
}>;
export type TimelineItemAggregate = Agg.Aggregate<TimelineItemAggregateId, 'timelineItem', TimelineItem>;
const toAggregateId = (timelineItem: TimelineItem): TimelineItemAggregateId => ({
  timelineItemId: timelineItem.timelineItemId,
});

type TimelineItemEvent<
  TAggregateState extends Agg.InferState<TimelineItemAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<TimelineItemAggregate, TAggregateState, TEventName, TEventPayload>;
const TimelineItemEvent = AggregateEvent.createFactory<TimelineItemAggregate>('timelineItem');

export type TimelineItemCreated = TimelineItemEvent<TimelineItem, 'timelineItem.created', TimelineItem>;
export type TimelineItemDeleted = TimelineItemEvent<
  undefined,
  'timelineItem.deleted',
  { timelineItemId: TimelineItemId }
>;

const createTimelineItem = (payload: TimelineItem, now: Instant): TimelineItemCreated => {
  return TimelineItemEvent.create(
    toAggregateId(payload),
    payload,
    'timelineItem.created',
    payload,
    now,
  );
};

const deleteTimelineItem = (timelineItemId: TimelineItemId, now: Instant): TimelineItemDeleted => {
  return TimelineItemEvent.create(
    { timelineItemId },
    undefined,
    'timelineItem.deleted',
    { timelineItemId },
    now,
  );
};

export type TimelineItemCreatedStore = Agg.Store<TimelineItemCreated>;
export type TimelineItemDeletedStore = Agg.Store<TimelineItemDeleted>;
export type TimelineItemsResolverByActorIds = Agg.Resolver<
  {
    actorIds: ActorId[];
    currentActorId: ActorId | undefined;
    createdAt: Instant | undefined;
  },
  TimelineItemWithPost[]
>;
export type TimelineItemResolverByPostId = Agg.Resolver<
  { postId: PostId },
  TimelineItem | undefined
>;
export type TimelineItemsResolverByPostId = Agg.Resolver<
  { postId: PostId },
  TimelineItem[]
>;
export type TimelineItemResolverByRepostId = Agg.Resolver<
  { repostId: RepostId },
  TimelineItem | undefined
>;

export type PostTimelineItem = {
  type: 'post';
  timelineItemId: TimelineItemId;
  post: PostWithAuthor;
  createdAt: Instant;
};

export type RepostTimelineItem = {
  type: 'repost';
  timelineItemId: TimelineItemId;
  post: PostWithAuthor;
  repostedBy: {
    actorId: ActorId;
    username: string;
    logoUri: string | undefined;
  };
  createdAt: Instant;
};

export type TimelineItemWithPost = PostTimelineItem | RepostTimelineItem;

export const TimelineItem = {
  ...schema,
  createTimelineItem,
  deleteTimelineItem,
  toAggregateId,
  Type: TimelineItemType,
} as const;
