import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
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
              postId,
              actorId,
              content: 'remote post',
              createdAt: Date.now() as never,
              uri: 'https://remote.example/posts/1',
              inReplyToUri: null,
              visibility: null,
            }),
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
    const buildDeps = () => {
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
          })
        ),
      };
      const deps = {
        remotePostResolverByUri,
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
      return { deps, postDeletedStore, remotePostResolverByUri };
    };

    it('deletes the post when the sender is on the same origin as the object', async () => {
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

    it('does not delete the post when the sender is missing', async () => {
      const { deps, postDeletedStore } = buildDeps();
      await createOnDelete(deps)(
        {} as never,
        { actorId: null, objectId: new URL('https://remote.example/posts/1') } as never,
      );
      expect(postDeletedStore.store).not.toHaveBeenCalled();
    });
  });
});
