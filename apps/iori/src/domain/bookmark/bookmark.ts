import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { PageRequest } from '../page/page.ts';
import { PostId } from '../post/postId.ts';
import { BookmarkId } from './bookmarkId.ts';

const zodType = z
  .object({
    bookmarkId: BookmarkId.zodType,
    actorId: ActorId.zodType,
    postId: PostId.zodType,
  })
  .describe('Bookmark');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type Bookmark = z.output<typeof zodType>;
export type BookmarkAggregateId = Readonly<{
  bookmarkId: BookmarkId;
}>;
export type BookmarkAggregate = Agg.Aggregate<BookmarkAggregateId, 'bookmark', Bookmark>;
const toAggregateId = (bookmark: Bookmark): BookmarkAggregateId => ({
  bookmarkId: bookmark.bookmarkId,
});

type BookmarkEvent<
  TAggregateState extends Agg.InferState<BookmarkAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<BookmarkAggregate, TAggregateState, TEventName, TEventPayload>;
const BookmarkEvent = AggregateEvent.createFactory<BookmarkAggregate>('bookmark');

export type BookmarkCreated = BookmarkEvent<Bookmark, 'bookmark.bookmarkCreated', Bookmark>;
export type BookmarkDeleted = BookmarkEvent<
  undefined,
  'bookmark.bookmarkDeleted',
  { bookmarkId: BookmarkId }
>;

const createBookmark = (payload: Bookmark, now: Instant): BookmarkCreated => {
  return BookmarkEvent.create(
    toAggregateId(payload),
    payload,
    'bookmark.bookmarkCreated',
    payload,
    now,
  );
};

const deleteBookmark = (bookmark: Bookmark, now: Instant): BookmarkDeleted => {
  return BookmarkEvent.create(
    toAggregateId(bookmark),
    undefined,
    'bookmark.bookmarkDeleted',
    { bookmarkId: bookmark.bookmarkId },
    now,
  );
};

export type BookmarkCreatedStore = Readonly<{
  store: (...events: readonly BookmarkCreated[]) => RA<void, AlreadyBookmarkedError>;
}>;
export type BookmarkDeletedStore = Agg.Store<BookmarkDeleted>;
export type BookmarkResolver = Agg.Resolver<
  { actorId: ActorId; postId: PostId },
  Bookmark | undefined
>;
export type BookmarksResolverByPostId = Agg.Resolver<{ postId: PostId }, Bookmark[]>;
export type BookmarkedPostIdsResolverByActorIdWithPagination = Agg.Resolver<
  Readonly<{ actorId: ActorId; page: PageRequest }>,
  ReadonlyArray<Readonly<{ bookmarkId: BookmarkId; postId: PostId }>>
>;
export const Bookmark = {
  ...schema,
  createBookmark,
  deleteBookmark,
  toAggregateId,
} as const;

export type AlreadyBookmarkedError = Readonly<{
  type: 'AlreadyBookmarkedError';
  message: string;
  detail: {
    actorId: ActorId;
    postId: PostId;
  };
}>;

export const AlreadyBookmarkedError = {
  create: ({
    actorId,
    postId,
  }: { actorId: ActorId; postId: PostId }): AlreadyBookmarkedError => ({
    type: 'AlreadyBookmarkedError',
    message: `The actor with ID "${actorId}" has already bookmarked the post "${postId}".`,
    detail: { actorId, postId },
  }),
} as const;

export type NotBookmarkedError = Readonly<{
  type: 'NotBookmarkedError';
  message: string;
  detail: {
    actorId: ActorId;
    postId: PostId;
  };
}>;

export const NotBookmarkedError = {
  create: ({
    actorId,
    postId,
  }: { actorId: ActorId; postId: PostId }): NotBookmarkedError => ({
    type: 'NotBookmarkedError',
    message: `The actor with ID "${actorId}" has not bookmarked the post "${postId}".`,
    detail: { actorId, postId },
  }),
} as const;
