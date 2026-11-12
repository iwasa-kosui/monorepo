import { describe, expect, it } from 'vitest';

import { ActorId } from '../actor/actorId.ts';
import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { AlreadyBookmarkedError, Bookmark, NotBookmarkedError } from './bookmark.ts';
import { BookmarkId } from './bookmarkId.ts';

const bookmark = Bookmark.orThrow({
  bookmarkId: BookmarkId.generate(),
  actorId: ActorId.generate(),
  postId: PostId.generate(),
});

describe('Bookmark', () => {
  it('作成のイベントが集約の状態と payload に同じ値を持つ', () => {
    const event = Bookmark.createBookmark(bookmark, Instant.orThrow(1_000));

    expect(event.eventName).toBe('bookmark.bookmarkCreated');
    expect(event.aggregateId).toEqual({ bookmarkId: bookmark.bookmarkId });
    expect(event.aggregateState).toEqual(bookmark);
    expect(event.eventPayload).toEqual(bookmark);
    expect(event.occurredAt).toBe(1_000);
  });

  it('削除のイベントが bookmarkId だけを payload に持ち、集約の状態を空にする', () => {
    const event = Bookmark.deleteBookmark(bookmark, Instant.orThrow(2_000));

    expect(event.eventName).toBe('bookmark.bookmarkDeleted');
    expect(event.aggregateId).toEqual({ bookmarkId: bookmark.bookmarkId });
    expect(event.aggregateState).toBeUndefined();
    expect(event.eventPayload).toEqual({ bookmarkId: bookmark.bookmarkId });
  });

  it('UUID でない bookmarkId を持つ値を受け付けない', () => {
    expect(Bookmark.parse({ ...bookmark, bookmarkId: 'not-a-uuid' }).ok).toBe(false);
  });

  it('エラーが種別と対象を持つ', () => {
    const detail = { actorId: bookmark.actorId, postId: bookmark.postId };

    expect(AlreadyBookmarkedError.create(detail)).toMatchObject({ type: 'AlreadyBookmarkedError', detail });
    expect(NotBookmarkedError.create(detail)).toMatchObject({ type: 'NotBookmarkedError', detail });
  });
});
