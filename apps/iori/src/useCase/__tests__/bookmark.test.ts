import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type {
  Bookmark,
  BookmarkCreated,
  BookmarkCreatedStore,
  BookmarkDeleted,
  BookmarkDeletedStore,
  BookmarkResolver,
} from '../../domain/bookmark/bookmark.ts';
import type { BookmarkId } from '../../domain/bookmark/bookmarkId.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { SessionId } from '../../domain/session/sessionId.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { CreateBookmarkUseCase } from '../createBookmark.ts';
import { DeleteBookmarkUseCase } from '../deleteBookmark.ts';
import {
  createMockActorResolverByUserId,
  createMockSessionResolver,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

const setup = () => {
  const sessionResolver = createMockSessionResolver();
  const userResolver = createMockUserResolver();
  const actorResolverByUserId = createMockActorResolverByUserId();
  const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as Username };
  const actor: LocalActor = {
    id: crypto.randomUUID() as LocalActor['id'],
    userId: user.id,
    uri: 'https://example.com/users/kosui',
    inboxUrl: 'https://example.com/inbox',
    type: 'local',
    logoUri: undefined,
  };
  userResolver.setUser(user);
  actorResolverByUserId.setActor(actor);
  const bookmarks = new Map<string, Bookmark>();
  const keyOf = (actorId: string, postId: string) => `${actorId}:${postId}`;
  const bookmarkResolver: BookmarkResolver = {
    resolve: async ({ actorId, postId }) => RA.ok(bookmarks.get(keyOf(actorId, postId))),
  };
  const bookmarkCreatedStore = {
    store: vi.fn(async (event: BookmarkCreated) => {
      bookmarks.set(keyOf(event.aggregateState.actorId, event.aggregateState.postId), event.aggregateState);
      return RA.ok(undefined);
    }),
  } satisfies BookmarkCreatedStore;
  const bookmarkDeletedStore = {
    store: vi.fn(async (event: BookmarkDeleted) => {
      for (const [key, bookmark] of bookmarks) {
        if (bookmark.bookmarkId === event.eventPayload.bookmarkId) bookmarks.delete(key);
      }
      return RA.ok(undefined);
    }),
  } satisfies BookmarkDeletedStore;
  const deps = { sessionResolver, userResolver, actorResolverByUserId, bookmarkResolver };
  return {
    user,
    actor,
    bookmarks,
    bookmarkCreatedStore,
    bookmarkDeletedStore,
    create: CreateBookmarkUseCase.create({ ...deps, bookmarkCreatedStore }),
    delete: DeleteBookmarkUseCase.create({ ...deps, bookmarkDeletedStore }),
  };
};

const newPostId = () => crypto.randomUUID() as PostId;

describe('CreateBookmarkUseCase', () => {
  it('ブックマークを保存し、作成のイベントに自分のアクターと投稿を持たせる', async () => {
    const t = setup();
    const postId = newPostId();

    const result = await t.create.run({ userId: t.user.id, postId });

    expect(result.ok).toBe(true);
    expect(t.bookmarkCreatedStore.store).toHaveBeenCalledTimes(1);
    const [event] = t.bookmarkCreatedStore.store.mock.calls[0]!;
    expect(event.eventName).toBe('bookmark.bookmarkCreated');
    expect(event.aggregateState).toMatchObject({ actorId: t.actor.id, postId });
  });

  it('既にブックマークしているとき AlreadyBookmarkedError を返し、保存しない', async () => {
    const t = setup();
    const postId = newPostId();
    await t.create.run({ userId: t.user.id, postId });

    const result = await t.create.run({ userId: t.user.id, postId });

    expect(result).toMatchObject({ ok: false, err: { type: 'AlreadyBookmarkedError' } });
    expect(t.bookmarkCreatedStore.store).toHaveBeenCalledTimes(1);
  });

  it('ユーザーが存在しないとき UserNotFoundError を返し、保存しない', async () => {
    const t = setup();

    const result = await t.create.run({ userId: crypto.randomUUID() as User['id'], postId: newPostId() });

    expect(result).toMatchObject({ ok: false, err: { type: 'UserNotFoundError' } });
    expect(t.bookmarkCreatedStore.store).not.toHaveBeenCalled();
  });

  it('セッションが存在しないとき SessionExpiredError を返し、保存しない', async () => {
    const t = setup();

    const result = await t.create.run({
      sessionId: crypto.randomUUID() as SessionId,
      postId: newPostId(),
    });

    expect(result).toMatchObject({ ok: false, err: { type: 'SessionExpiredError' } });
    expect(t.bookmarkCreatedStore.store).not.toHaveBeenCalled();
  });
});

describe('DeleteBookmarkUseCase', () => {
  it('ブックマークを消し、削除のイベントに bookmarkId を持たせる', async () => {
    const t = setup();
    const postId = newPostId();
    await t.create.run({ userId: t.user.id, postId });
    const bookmarkId: BookmarkId = t.bookmarks.get(`${t.actor.id}:${postId}`)!.bookmarkId;

    const result = await t.delete.run({ userId: t.user.id, postId });

    expect(result.ok).toBe(true);
    const [event] = t.bookmarkDeletedStore.store.mock.calls[0]!;
    expect(event.eventName).toBe('bookmark.bookmarkDeleted');
    expect(event.eventPayload).toEqual({ bookmarkId });
    expect(t.bookmarks.size).toBe(0);
  });

  it('ブックマークがないとき NotBookmarkedError を返し、削除しない', async () => {
    const t = setup();

    const result = await t.delete.run({ userId: t.user.id, postId: newPostId() });

    expect(result).toMatchObject({ ok: false, err: { type: 'NotBookmarkedError' } });
    expect(t.bookmarkDeletedStore.store).not.toHaveBeenCalled();
  });

  it('ユーザーが存在しないとき UserNotFoundError を返し、削除しない', async () => {
    const t = setup();

    const result = await t.delete.run({ userId: crypto.randomUUID() as User['id'], postId: newPostId() });

    expect(result).toMatchObject({ ok: false, err: { type: 'UserNotFoundError' } });
    expect(t.bookmarkDeletedStore.store).not.toHaveBeenCalled();
  });
});
