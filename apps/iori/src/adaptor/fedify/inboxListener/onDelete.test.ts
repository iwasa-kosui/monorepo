import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { BookmarkId } from '../../../domain/bookmark/bookmarkId.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createOnDelete, type OnDeleteDeps } from './onDelete.ts';

const remoteAuthor = {
  type: 'remote' as const,
  uri: 'https://remote.example/users/alice',
  inboxUrl: 'https://remote.example/users/alice/inbox',
  url: undefined,
  username: 'alice',
  logoUri: undefined,
};

describe('createOnDelete', () => {
  it.each([false, true])(
    'settles all reference writes before completing the handler (early failure: %s)',
    async (failEarly) => {
      const sibling = Promise.withResolvers<void>();
      const entered = Promise.withResolvers<void>();
      const postId = PostId.generate();
      const actorId = ActorId.generate();
      const calls: string[] = [];
      const store = (name: string) =>
        vi.fn(async () => {
          await Promise.resolve();
          if (failEarly && name === 'timeline') throw new Error('write_failed');
          if (failEarly && name === 'notification') {
            entered.resolve();
            await sibling.promise;
          }
          calls.push(name);
          return RA.ok(undefined);
        });
      const deps = {
        remotePostResolverByUri: {
          resolve: async () =>
            RA.ok({
              type: 'remote' as const,
              summary: null,
              sensitive: false,
              postId,
              actorId,
              content: 'remote post',
              createdAt: Date.now() as never,
              uri: 'https://remote.example/posts/1',
              inReplyToUri: null,
              visibility: null,
            }),
        },
        actorResolverById: {
          resolve: async () => RA.ok({ ...remoteAuthor, id: actorId }),
        },
        timelineItemsResolverByPostId: {
          resolve: async () =>
            RA.ok([{
              timelineItemId: TimelineItemId.generate(),
              type: 'post' as const,
              actorId,
              postId,
              repostId: null,
              createdAt: Date.now() as never,
            }]),
        },
        likeNotificationsResolverByPostId: {
          resolve: async () =>
            RA.ok([{
              type: 'like' as const,
              notificationId: NotificationId.generate(),
              recipientUserId: UserId.generate(),
              isRead: false,
              likerActorId: actorId,
              likedPostId: postId,
            }]),
        },
        emojiReactNotificationsResolverByPostId: { resolve: async () => RA.ok([]) },
        replyNotificationsResolverByReplyPostId: { resolve: async () => RA.ok([]) },
        replyNotificationsResolverByOriginalPostId: { resolve: async () => RA.ok([]) },
        repostsResolverByPostId: {
          resolve: async () =>
            RA.ok([{
              repostId: RepostId.generate(),
              actorId,
              postId,
              announceActivityUri: 'https://remote.example/activities/announce',
              createdAt: Date.now() as never,
            }]),
        },
        likesResolverByPostId: {
          resolve: async () =>
            RA.ok([{
              type: 'remote' as const,
              likeId: LikeId.generate(),
              actorId,
              postId,
              likeActivityUri: 'https://remote.example/activities/like',
            }]),
        },
        emojiReactsResolverByPostId: {
          resolve: async () =>
            RA.ok([{
              emojiReactId: EmojiReactId.generate(),
              actorId,
              postId,
              emoji: ':wave:',
              emojiReactActivityUri: 'https://remote.example/activities/react',
              emojiImageUrl: null,
            }]),
        },
        federatedTimelineItemsResolverByPostId: {
          resolve: async () =>
            RA.ok([{
              federatedTimelineItemId: FederatedTimelineItemId.generate(),
              postId,
              relayId: RelayId.generate(),
              receivedAt: Date.now() as never,
            }]),
        },
        timelineItemDeletedStore: { store: store('timeline') },
        likeNotificationDeletedStore: { store: store('notification') },
        emojiReactNotificationDeletedStore: { store: store('emoji-notification') },
        replyNotificationDeletedStore: { store: store('reply-notification') },
        repostDeletedStore: { store: store('repost') },
        localLikeDeletedStore: { store: store('local-like') },
        remoteLikeDeletedStore: { store: store('remote-like') },
        emojiReactDeletedStore: { store: store('emoji-react') },
        federatedTimelineItemDeletedStore: { store: store('federated-timeline') },
        postDeletedStore: { store: store('post') },
      } satisfies OnDeleteDeps;

      let finished = false;
      const processing = createOnDelete(deps)(
        {} as never,
        {
          actorId: new URL('https://remote.example/users/alice'),
          objectId: new URL('https://remote.example/posts/1'),
        } as never,
      );
      const observed = processing.then(() => {
        finished = true;
      }, (error) => {
        finished = true;
        throw error;
      });
      if (failEarly) {
        await entered.promise;
        await Promise.resolve();
        expect(finished).toBe(false);
        expect(calls).not.toContain('post');
        sibling.resolve();
        await expect(observed).rejects.toThrow('write_failed');
        expect(calls).toContain('notification');
        expect(calls).not.toContain('post');
        return;
      }
      await observed;

      expect(calls).toEqual(expect.arrayContaining([
        'timeline',
        'notification',
        'repost',
        'remote-like',
        'emoji-react',
        'federated-timeline',
        'post',
      ]));
      expect(calls.at(-1)).toBe('post');
    },
  );

  describe('sender check', () => {
    const buildDeps = (author: typeof remoteAuthor | null = remoteAuthor) => {
      const postId = PostId.generate();
      const actorId = ActorId.generate();
      const empty = { resolve: async () => RA.ok([]) };
      const postDeletedStore = { store: vi.fn(async () => RA.ok(undefined)) };
      const noopStore = { store: vi.fn(async () => RA.ok(undefined)) };
      const remotePostResolverByUri = {
        resolve: vi.fn(async () =>
          RA.ok({
            type: 'remote' as const,
            postId,
            actorId,
            content: 'remote post',
            createdAt: Date.now() as never,
            uri: 'https://remote.example/posts/1',
            inReplyToUri: null,
            visibility: null,
            summary: null,
            sensitive: false,
          })
        ),
      };
      const actorResolverById = {
        resolve: vi.fn(async () => RA.ok(author ? { ...author, id: actorId } : undefined)),
      };
      const deps = {
        remotePostResolverByUri,
        actorResolverById,
        timelineItemsResolverByPostId: empty,
        likeNotificationsResolverByPostId: empty,
        emojiReactNotificationsResolverByPostId: empty,
        replyNotificationsResolverByReplyPostId: empty,
        replyNotificationsResolverByOriginalPostId: empty,
        repostsResolverByPostId: empty,
        likesResolverByPostId: empty,
        emojiReactsResolverByPostId: empty,
        federatedTimelineItemsResolverByPostId: empty,
        timelineItemDeletedStore: noopStore,
        likeNotificationDeletedStore: noopStore,
        emojiReactNotificationDeletedStore: noopStore,
        replyNotificationDeletedStore: noopStore,
        repostDeletedStore: noopStore,
        localLikeDeletedStore: noopStore,
        remoteLikeDeletedStore: noopStore,
        emojiReactDeletedStore: noopStore,
        federatedTimelineItemDeletedStore: noopStore,
        postDeletedStore,
      } satisfies OnDeleteDeps;
      return { deps, postDeletedStore, remotePostResolverByUri, actorResolverById };
    };

    it('deletes the post when the sender is the author of the post', async () => {
      const { deps, postDeletedStore } = buildDeps();
      await createOnDelete(deps)(
        {} as never,
        {
          actorId: new URL('https://remote.example/users/alice'),
          objectId: new URL('https://remote.example/posts/1'),
        } as never,
      );
      expect(postDeletedStore.store).toHaveBeenCalledTimes(1);
    });

    it('does not delete the post when the sender is on a different origin', async () => {
      const { deps, postDeletedStore, remotePostResolverByUri } = buildDeps();
      await createOnDelete(deps)(
        {} as never,
        {
          actorId: new URL('https://evil.example/users/mallory'),
          objectId: new URL('https://remote.example/posts/1'),
        } as never,
      );
      expect(remotePostResolverByUri.resolve).not.toHaveBeenCalled();
      expect(postDeletedStore.store).not.toHaveBeenCalled();
    });

    it('does not delete the post when another actor on the same origin sends the Delete', async () => {
      const { deps, postDeletedStore } = buildDeps();
      await createOnDelete(deps)(
        {} as never,
        {
          actorId: new URL('https://remote.example/users/mallory'),
          objectId: new URL('https://remote.example/posts/1'),
        } as never,
      );
      expect(postDeletedStore.store).not.toHaveBeenCalled();
    });

    it('does not delete the post when the author actor cannot be resolved', async () => {
      const { deps, postDeletedStore } = buildDeps(null);
      await createOnDelete(deps)(
        {} as never,
        {
          actorId: new URL('https://remote.example/users/alice'),
          objectId: new URL('https://remote.example/posts/1'),
        } as never,
      );
      expect(postDeletedStore.store).not.toHaveBeenCalled();
    });

    it('fails the handler so that it is retried when the author actor lookup fails', async () => {
      const { deps, postDeletedStore, actorResolverById } = buildDeps();
      actorResolverById.resolve.mockResolvedValueOnce(RA.err(new Error('db_down')) as never);
      await expect(
        createOnDelete(deps)(
          {} as never,
          {
            actorId: new URL('https://remote.example/users/alice'),
            objectId: new URL('https://remote.example/posts/1'),
          } as never,
        ),
      ).rejects.toThrow('Failed to resolve the author');
      expect(postDeletedStore.store).not.toHaveBeenCalled();
    });

    it('fails the handler so that it is retried when the remote post lookup fails', async () => {
      const { deps, postDeletedStore, remotePostResolverByUri } = buildDeps();
      remotePostResolverByUri.resolve.mockResolvedValueOnce(RA.err(new Error('db_down')) as never);
      await expect(
        createOnDelete(deps)(
          {} as never,
          {
            actorId: new URL('https://remote.example/users/alice'),
            objectId: new URL('https://remote.example/posts/1'),
          } as never,
        ),
      ).rejects.toThrow('Failed to resolve the remote post');
      expect(postDeletedStore.store).not.toHaveBeenCalled();
    });

    it('does not delete the post when the sender is missing', async () => {
      const { deps, postDeletedStore } = buildDeps();
      await createOnDelete(deps)(
        {} as never,
        { actorId: null, objectId: new URL('https://remote.example/posts/1') } as never,
      );
      expect(postDeletedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('mention notifications', () => {
    const buildDeps = (
      mention?: Pick<OnDeleteDeps, 'mentionNotificationsResolverByMentionPostId' | 'mentionNotificationDeletedStore'>,
    ) => {
      const postId = PostId.generate();
      const actorId = ActorId.generate();
      const empty = { resolve: async () => RA.ok([]) };
      const noopStore = { store: vi.fn(async () => RA.ok(undefined)) };
      const postDeletedStore = { store: vi.fn(async () => RA.ok(undefined)) };
      const deps = {
        remotePostResolverByUri: {
          resolve: async () =>
            RA.ok({
              type: 'remote' as const,
              postId,
              actorId,
              content: 'remote post',
              createdAt: Date.now() as never,
              uri: 'https://remote.example/posts/1',
              inReplyToUri: null,
              visibility: null,
              summary: null,
              sensitive: false,
            }),
        },
        actorResolverById: { resolve: async () => RA.ok({ ...remoteAuthor, id: actorId }) },
        timelineItemsResolverByPostId: empty,
        likeNotificationsResolverByPostId: empty,
        emojiReactNotificationsResolverByPostId: empty,
        replyNotificationsResolverByReplyPostId: empty,
        replyNotificationsResolverByOriginalPostId: empty,
        ...mention,
        repostsResolverByPostId: empty,
        likesResolverByPostId: empty,
        emojiReactsResolverByPostId: empty,
        federatedTimelineItemsResolverByPostId: empty,
        timelineItemDeletedStore: noopStore,
        likeNotificationDeletedStore: noopStore,
        emojiReactNotificationDeletedStore: noopStore,
        replyNotificationDeletedStore: noopStore,
        repostDeletedStore: noopStore,
        localLikeDeletedStore: noopStore,
        remoteLikeDeletedStore: noopStore,
        emojiReactDeletedStore: noopStore,
        federatedTimelineItemDeletedStore: noopStore,
        postDeletedStore,
      } satisfies OnDeleteDeps;
      return { deps, postId, actorId, postDeletedStore };
    };
    const activity = {
      actorId: new URL('https://remote.example/users/alice'),
      objectId: new URL('https://remote.example/posts/1'),
    } as never;

    it('deletes the mention notifications that point at the deleted post', async () => {
      const mentionNotificationDeletedStore = { store: vi.fn(async () => RA.ok(undefined)) };
      const mentionPostId = PostId.generate();
      const notification = {
        type: 'mention' as const,
        notificationId: NotificationId.generate(),
        recipientUserId: UserId.generate(),
        isRead: false,
        mentionerActorId: ActorId.generate(),
        mentionPostId,
      };
      const mentionNotificationsResolverByMentionPostId = {
        resolve: vi.fn(async () => RA.ok([notification])),
      };
      const { deps, postId, postDeletedStore } = buildDeps({
        mentionNotificationsResolverByMentionPostId,
        mentionNotificationDeletedStore,
      });

      await createOnDelete(deps)({} as never, activity);

      expect(mentionNotificationsResolverByMentionPostId.resolve).toHaveBeenCalledWith({ mentionPostId: postId });
      expect(mentionNotificationDeletedStore.store).toHaveBeenCalledTimes(1);
      expect(mentionNotificationDeletedStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'notification.mentionNotificationDeleted',
          eventPayload: {
            notificationId: notification.notificationId,
            mentionerActorId: notification.mentionerActorId,
            mentionPostId,
          },
        }),
      );
      expect(postDeletedStore.store).toHaveBeenCalledTimes(1);
    });

    it('deletes the post without the mention dependencies', async () => {
      const { deps, postDeletedStore } = buildDeps();

      await createOnDelete(deps)({} as never, activity);

      expect(postDeletedStore.store).toHaveBeenCalledTimes(1);
    });
  });

  describe('bookmarks', () => {
    it('deletes the bookmarks of the post before the post itself', async () => {
      const postId = PostId.generate();
      const actorId = ActorId.generate();
      const bookmark = { bookmarkId: BookmarkId.generate(), actorId: ActorId.generate(), postId };
      const calls: string[] = [];
      const empty = { resolve: async () => RA.ok([]) };
      const noopStore = { store: vi.fn(async () => RA.ok(undefined)) };
      const bookmarksResolverByPostId = { resolve: vi.fn(async () => RA.ok([bookmark])) };
      const bookmarkDeletedStore = {
        store: vi.fn(async () => {
          calls.push('bookmark');
          return RA.ok(undefined);
        }),
      };
      const postDeletedStore = {
        store: vi.fn(async () => {
          calls.push('post');
          return RA.ok(undefined);
        }),
      };
      const deps = {
        remotePostResolverByUri: {
          resolve: async () =>
            RA.ok({
              type: 'remote' as const,
              postId,
              actorId,
              content: 'remote post',
              createdAt: Date.now() as never,
              uri: 'https://remote.example/posts/1',
              inReplyToUri: null,
              visibility: null,
              summary: null,
              sensitive: false,
            }),
        },
        actorResolverById: { resolve: async () => RA.ok({ ...remoteAuthor, id: actorId }) },
        timelineItemsResolverByPostId: empty,
        likeNotificationsResolverByPostId: empty,
        emojiReactNotificationsResolverByPostId: empty,
        replyNotificationsResolverByReplyPostId: empty,
        replyNotificationsResolverByOriginalPostId: empty,
        repostsResolverByPostId: empty,
        likesResolverByPostId: empty,
        emojiReactsResolverByPostId: empty,
        bookmarksResolverByPostId,
        federatedTimelineItemsResolverByPostId: empty,
        timelineItemDeletedStore: noopStore,
        likeNotificationDeletedStore: noopStore,
        emojiReactNotificationDeletedStore: noopStore,
        replyNotificationDeletedStore: noopStore,
        repostDeletedStore: noopStore,
        localLikeDeletedStore: noopStore,
        remoteLikeDeletedStore: noopStore,
        emojiReactDeletedStore: noopStore,
        bookmarkDeletedStore,
        federatedTimelineItemDeletedStore: noopStore,
        postDeletedStore,
      } satisfies OnDeleteDeps;

      await createOnDelete(deps)(
        {} as never,
        {
          actorId: new URL('https://remote.example/users/alice'),
          objectId: new URL('https://remote.example/posts/1'),
        } as never,
      );

      expect(bookmarksResolverByPostId.resolve).toHaveBeenCalledWith({ postId });
      expect(bookmarkDeletedStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'bookmark.bookmarkDeleted',
          eventPayload: { bookmarkId: bookmark.bookmarkId },
        }),
      );
      expect(calls).toEqual(['bookmark', 'post']);
    });
  });
});
