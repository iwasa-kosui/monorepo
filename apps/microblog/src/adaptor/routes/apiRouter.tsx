import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod/v4';

import { ActorId } from '../../domain/actor/actorId.ts';
import { ImageId } from '../../domain/image/imageId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostContent } from '../../domain/post/postContent.ts';
import { PostId } from '../../domain/post/postId.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { Username } from '../../domain/user/username.ts';
import { Federation } from '../../federation.ts';
import { CreateMuteUseCase } from '../../useCase/createMute.ts';
import { DeleteMuteUseCase } from '../../useCase/deleteMute.ts';
import { DeletePostUseCase } from '../../useCase/deletePost.ts';
import { GetFederatedTimelineUseCase } from '../../useCase/getFederatedTimeline.ts';
import { GetMutesUseCase } from '../../useCase/getMutes.ts';
import { GetRemoteActorPostsUseCase } from '../../useCase/getRemoteActorPosts.ts';
import { GetTimelineUseCase } from '../../useCase/getTimeline.ts';
import { GetUserPostsUseCase } from '../../useCase/getUserPosts.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from '../../useCase/helper/resolve.ts';
import { SendEmojiReactUseCase } from '../../useCase/sendEmojiReact.ts';
import { SendLikeUseCase } from '../../useCase/sendLike.ts';
import { SendReplyUseCase } from '../../useCase/sendReply.ts';
import { SendRepostUseCase } from '../../useCase/sendRepost.ts';
import { SubscribeRelayUseCase } from '../../useCase/subscribeRelay.ts';
import { UndoEmojiReactUseCase } from '../../useCase/undoEmojiReact.ts';
import { UndoLikeUseCase } from '../../useCase/undoLike.ts';
import { UndoRepostUseCase } from '../../useCase/undoRepost.ts';
import type { InferUseCaseError } from '../../useCase/useCase.ts';
import { PgActorResolverByUserId } from '../pg/actor/actorResolverByUserId.ts';
import { PgActorResolverByFollowerId } from '../pg/actor/followsResolverByFollowerId.ts';
import { PgActorResolverByFollowingId } from '../pg/actor/followsResolverByFollowingId.ts';
import { PgArticleDeletedStore } from '../pg/article/articleDeletedStore.ts';
import { PgArticleResolverByRootPostId } from '../pg/article/articleResolverByRootPostId.ts';
import { PgEmojiReactCreatedStore } from '../pg/emojiReact/emojiReactCreatedStore.ts';
import { PgEmojiReactDeletedStore } from '../pg/emojiReact/emojiReactDeletedStore.ts';
import { PgEmojiReactResolverByActorAndPostAndEmoji } from '../pg/emojiReact/emojiReactResolverByActorAndPostAndEmoji.ts';
import { PgFederatedTimelineItemsResolver } from '../pg/federatedTimeline/federatedTimelineItemsResolver.ts';
import { PgPostImageCreatedStore } from '../pg/image/postImageCreatedStore.ts';
import { PgLikeResolver } from '../pg/like/likeResolver.ts';
import { PgLocalLikeCreatedStore } from '../pg/like/localLikeCreatedStore.ts';
import { PgLocalLikeDeletedStore } from '../pg/like/localLikeDeletedStore.ts';
import { PgMuteCreatedStore } from '../pg/mute/muteCreatedStore.ts';
import { PgMutedActorIdsResolverByUserId } from '../pg/mute/mutedActorIdsResolverByUserId.ts';
import { PgMuteDeletedStore } from '../pg/mute/muteDeletedStore.ts';
import { PgMuteResolver } from '../pg/mute/muteResolver.ts';
import { PgMutesResolverByUserId } from '../pg/mute/mutesResolverByUserId.ts';
import { PgReplyNotificationCreatedStore } from '../pg/notification/replyNotificationCreatedStore.ts';
import { PgUnreadNotificationCountResolverByUserId } from '../pg/notification/unreadNotificationCountResolverByUserId.ts';
import { PgLocalPostResolverByUri } from '../pg/post/localPostResolverByUri.ts';
import { PgPostCreatedStore } from '../pg/post/postCreatedStore.ts';
import { PgPostDeletedStore } from '../pg/post/postDeletedStore.ts';
import { PgPostResolver } from '../pg/post/postResolver.ts';
import { PgRemotePostUpserter } from '../pg/post/remotePostUpserter.ts';
import { PgThreadResolver } from '../pg/post/threadResolver.ts';
import { PgPushSubscriptionsResolverByUserId } from '../pg/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { PgRelayResolverByActorUri } from '../pg/relay/relayResolverByActorUri.ts';
import { PgRelaySubscriptionRequestedStore } from '../pg/relay/relaySubscriptionRequestedStore.ts';
import { PgRepostCreatedStore } from '../pg/repost/repostCreatedStore.ts';
import { PgRepostDeletedStore } from '../pg/repost/repostDeletedStore.ts';
import { PgRepostResolver } from '../pg/repost/repostResolver.ts';
import { PgSessionResolver } from '../pg/session/sessionResolver.ts';
import { PgTimelineItemCreatedStore } from '../pg/timeline/timelineItemCreatedStore.ts';
import { PgTimelineItemDeletedStore } from '../pg/timeline/timelineItemDeletedStore.ts';
import { PgTimelineItemResolverByRepostId } from '../pg/timeline/timelineItemResolverByRepostId.ts';
import { PgTimelineItemsResolverByActorIds } from '../pg/timeline/timelineItemsResolverByActorIds.ts';
import { PgUserResolver } from '../pg/user/userResolver.ts';
import { WebPushSender } from '../webPush/webPushSender.ts';
import { sanitize } from './helper/sanitize.ts';

const app = new Hono()
  .get(
    '/v1/home',
    sValidator(
      'query',
      z.object({
        createdAt: z.optional(z.coerce.number().pipe(Instant.zodType)),
      }),
      (res, c) => {
        if (!res.success) {
          return c.json(
            { error: res.error.flatMap((e) => e.message).join(',') },
            400,
          );
        }
      },
    ),
    async (c) => {
      const useCase = GetTimelineUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        timelineItemsResolverByActorIds: PgTimelineItemsResolverByActorIds.getInstance(),
        actorsResolverByFollowerId: PgActorResolverByFollowerId.getInstance(),
        actorsResolverByFollowingId: PgActorResolverByFollowingId.getInstance(),
        mutedActorIdsResolverByUserId: PgMutedActorIdsResolverByUserId.getInstance(),
      });
      const sessionId = getCookie(c, 'sessionId');
      if (!sessionId) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      const createdAt = c.req.valid('query').createdAt;
      return RA.flow(
        RA.ok(sessionId),
        RA.andThen((sessionId) => useCase.run({ sessionId: SessionId.orThrow(sessionId), createdAt })),
        RA.match({
          ok: ({ user, timelineItems, actor, followers, following }) => {
            return c.json({
              user,
              timelineItems: timelineItems.map((item) => ({
                ...item,
                post: {
                  ...item.post,
                  content: sanitize(item.post.content),
                },
              })),
              actor,
              followers,
              following,
            });
          },
          err: (err) => {
            deleteCookie(c, 'sessionId');
            return c.json({ error: String(JSON.stringify(err)) }, 400);
          },
        }),
      );
    },
  )
  .get(
    '/v1/federated',
    sValidator(
      'query',
      z.object({
        receivedAt: z.optional(z.coerce.number().pipe(Instant.zodType)),
      }),
      (res, c) => {
        if (!res.success) {
          return c.json(
            { error: res.error.flatMap((e) => e.message).join(',') },
            400,
          );
        }
      },
    ),
    async (c) => {
      const useCase = GetFederatedTimelineUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        federatedTimelineItemsResolver: PgFederatedTimelineItemsResolver.getInstance(),
        mutedActorIdsResolverByUserId: PgMutedActorIdsResolverByUserId.getInstance(),
      });
      const sessionId = getCookie(c, 'sessionId');
      if (!sessionId) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      const receivedAt = c.req.valid('query').receivedAt;
      return RA.flow(
        RA.ok(sessionId),
        RA.andThen((sessionId) => useCase.run({ sessionId: SessionId.orThrow(sessionId), receivedAt })),
        RA.match({
          ok: ({ items, nextCursor }) => {
            return c.json({
              items: items.map((item) => ({
                ...item,
                post: {
                  ...item.post,
                  content: sanitize(item.post.content),
                },
              })),
              nextCursor,
            });
          },
          err: (err) => {
            deleteCookie(c, 'sessionId');
            return c.json({ error: String(JSON.stringify(err)) }, 400);
          },
        }),
      );
    },
  )
  .get('/v1/notifications/count', async (c) => {
    const sessionId = getCookie(c, 'sessionId');
    if (!sessionId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const now = Instant.now();
    const resolveSession = resolveSessionWith(PgSessionResolver.getInstance(), now);
    const resolveUser = resolveUserWith(PgUserResolver.getInstance());

    const result = await RA.flow(
      RA.ok(sessionId),
      RA.andThen(SessionId.parse),
      RA.andBind('session', resolveSession),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andThen(({ user }) => PgUnreadNotificationCountResolverByUserId.getInstance().resolve(user.id)),
    );

    return RA.match({
      ok: (count) => c.json({ count }),
      err: () => c.json({ error: 'Failed to get notification count' }, 400),
    })(result);
  })
  .post(
    '/v1/like',
    sValidator(
      'json',
      z.object({
        postId: PostId.zodType,
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { postId } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

      const useCase = SendLikeUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        localLikeCreatedStore: PgLocalLikeCreatedStore.getInstance(),
        likeResolver: PgLikeResolver.getInstance(),
        postResolver: PgPostResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        postId,
        request: c.req.raw,
        ctx,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to like: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  )
  .delete(
    '/v1/like',
    sValidator(
      'json',
      z.object({
        postId: PostId.zodType,
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { postId } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

      const useCase = UndoLikeUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        likeResolver: PgLikeResolver.getInstance(),
        localLikeDeletedStore: PgLocalLikeDeletedStore.getInstance(),
        postResolver: PgPostResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        postId,
        request: c.req.raw,
        ctx,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to undo like: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  )
  .post(
    '/v1/repost',
    sValidator(
      'json',
      z.object({
        postId: PostId.zodType,
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { postId } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

      const useCase = SendRepostUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        repostCreatedStore: PgRepostCreatedStore.getInstance(),
        repostResolver: PgRepostResolver.getInstance(),
        remotePostUpserter: PgRemotePostUpserter.getInstance(),
        timelineItemCreatedStore: PgTimelineItemCreatedStore.getInstance(),
        postResolver: PgPostResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        postId,
        request: c.req.raw,
        ctx,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to repost: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  )
  .delete(
    '/v1/repost',
    sValidator(
      'json',
      z.object({
        postId: PostId.zodType,
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { postId } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

      const useCase = UndoRepostUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        repostResolver: PgRepostResolver.getInstance(),
        repostDeletedStore: PgRepostDeletedStore.getInstance(),
        timelineItemResolverByRepostId: PgTimelineItemResolverByRepostId.getInstance(),
        timelineItemDeletedStore: PgTimelineItemDeletedStore.getInstance(),
        postResolver: PgPostResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        postId,
        request: c.req.raw,
        ctx,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to undo repost: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  )
  .post(
    '/v1/react',
    sValidator(
      'json',
      z.object({
        postId: PostId.zodType,
        emoji: z.string().min(1).max(128),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { postId, emoji } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

      const useCase = SendEmojiReactUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        emojiReactCreatedStore: PgEmojiReactCreatedStore.getInstance(),
        emojiReactResolverByActorAndPostAndEmoji: PgEmojiReactResolverByActorAndPostAndEmoji.getInstance(),
        postResolver: PgPostResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        postId,
        emoji,
        request: c.req.raw,
        ctx,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to react: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  )
  .delete(
    '/v1/react',
    sValidator(
      'json',
      z.object({
        postId: PostId.zodType,
        emoji: z.string().min(1).max(128),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { postId, emoji } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

      const useCase = UndoEmojiReactUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        emojiReactDeletedStore: PgEmojiReactDeletedStore.getInstance(),
        emojiReactResolverByActorAndPostAndEmoji: PgEmojiReactResolverByActorAndPostAndEmoji.getInstance(),
        postResolver: PgPostResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        postId,
        emoji,
        request: c.req.raw,
        ctx,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to undo react: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  )
  .post(
    '/v1/reply',
    sValidator(
      'json',
      z.object({
        postId: PostId.zodType,
        content: z.string().min(1),
        imageUrls: z.optional(z.array(z.string())),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { postId, content, imageUrls = [] } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

      const htmlContent = await PostContent.fromMarkdown(content);

      const useCase = SendReplyUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        postCreatedStore: PgPostCreatedStore.getInstance(),
        postImageCreatedStore: PgPostImageCreatedStore.getInstance(),
        timelineItemCreatedStore: PgTimelineItemCreatedStore.getInstance(),
        localPostResolverByUri: PgLocalPostResolverByUri.getInstance(),
        replyNotificationCreatedStore: PgReplyNotificationCreatedStore.getInstance(),
        pushSubscriptionsResolver: PgPushSubscriptionsResolverByUserId.getInstance(),
        webPushSender: WebPushSender.getInstance(),
        postResolver: PgPostResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        postId,
        content: htmlContent,
        imageUrls,
        request: c.req.raw,
        ctx,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to reply: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  )
  .post('/v1/upload', async (c) => {
    const sessionId = getCookie(c, 'sessionId');
    if (!sessionId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionIdResult = SessionId.parse(sessionId);
    if (!sessionIdResult.ok) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return c.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' },
        400,
      );
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return c.json({ error: 'File too large. Max size: 5MB' }, 400);
    }

    const imageId = ImageId.generate();
    const filename = `${imageId}.webp`;
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);
    const arrayBuffer = await file.arrayBuffer();

    // Convert to WebP format
    const webpBuffer = await sharp(Buffer.from(arrayBuffer))
      .webp({ quality: 80 })
      .toBuffer();

    await fs.writeFile(filePath, webpBuffer);

    const url = `/uploads/${filename}`;

    return c.json({
      imageId,
      url,
      filename,
    });
  })
  .delete('/v1/posts/:postId', async (c) => {
    const postIdParam = c.req.param('postId');
    const postIdResult = PostId.parse(postIdParam);
    if (!postIdResult.ok) {
      return c.json({ error: 'Invalid post ID' }, 400);
    }

    const sessionId = getCookie(c, 'sessionId');
    if (!sessionId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionIdResult = SessionId.parse(sessionId);
    if (!sessionIdResult.ok) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

    const useCase = DeletePostUseCase.create({
      sessionResolver: PgSessionResolver.getInstance(),
      userResolver: PgUserResolver.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      postDeletedStore: PgPostDeletedStore.getInstance(),
      postResolver: PgPostResolver.getInstance(),
      articleResolverByRootPostId: PgArticleResolverByRootPostId.getInstance(),
      articleDeletedStore: PgArticleDeletedStore.getInstance(),
    });

    const result = await useCase.run({
      sessionId: sessionIdResult.val,
      postId: postIdResult.val,
      ctx,
    });

    return RA.match({
      ok: () => c.json({ success: true }),
      err: (err: InferUseCaseError<DeletePostUseCase>) => {
        if (err.type === 'UnauthorizedError') {
          return c.json({ error: err.message }, 403);
        }
        if (err.type === 'PostNotFoundError') {
          return c.json({ error: err.message }, 404);
        }
        return c.json(
          { error: `Failed to delete: ${JSON.stringify(err)}` },
          400,
        );
      },
    })(result);
  })
  .get(
    '/v1/remote-users/:actorId/posts',
    sValidator(
      'param',
      z.object({
        actorId: ActorId.zodType,
      }),
      (res, c) => {
        if (!res.success) {
          return c.json(
            { error: res.error.flatMap((e) => e.message).join(',') },
            400,
          );
        }
      },
    ),
    sValidator(
      'query',
      z.object({
        createdAt: z.optional(z.coerce.number().pipe(Instant.zodType)),
      }),
      (res, c) => {
        if (!res.success) {
          return c.json(
            { error: res.error.flatMap((e) => e.message).join(',') },
            400,
          );
        }
      },
    ),
    async (c) => {
      const { actorId } = c.req.valid('param');
      const { createdAt } = c.req.valid('query');

      // Require authentication to view remote user posts
      const sessionIdCookie = getCookie(c, 'sessionId');
      const now = Instant.now();
      const resolveSession = resolveSessionWith(PgSessionResolver.getInstance(), now);
      const resolveUser = resolveUserWith(PgUserResolver.getInstance());
      const resolveLocalActor = resolveLocalActorWith(PgActorResolverByUserId.getInstance());

      const currentUserResult = await RA.flow(
        RA.ok(sessionIdCookie),
        RA.andThen(SessionId.parse),
        RA.andBind('session', resolveSession),
        RA.andBind('user', ({ session }) => resolveUser(session.userId)),
        RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
        RA.map(({ user, actor }) => ({ userId: user.id, actorId: actor.id })),
      );

      if (!currentUserResult.ok) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const { userId: currentUserId, actorId: currentUserActorId } = currentUserResult.val;
      const useCase = GetRemoteActorPostsUseCase.getInstance();

      return RA.flow(
        useCase.run({ actorId, currentUserActorId, currentUserId, createdAt }),
        RA.match({
          ok: ({ remoteActor, isFollowing, isMuted, posts }) => {
            return c.json({
              remoteActor,
              isFollowing,
              isMuted,
              isLoggedIn: true,
              posts: posts.map((post) => ({
                ...post,
                content: sanitize(post.content),
              })),
            });
          },
          err: (err) => {
            return c.json({ error: err.message }, 400);
          },
        }),
      );
    },
  )
  .get(
    '/v1/users/:username/posts',
    sValidator(
      'param',
      z.object({
        username: Username.zodType,
      }),
      (res, c) => {
        if (!res.success) {
          return c.json(
            { error: res.error.flatMap((e) => e.message).join(',') },
            400,
          );
        }
      },
    ),
    sValidator(
      'query',
      z.object({
        createdAt: z.optional(z.coerce.number().pipe(Instant.zodType)),
      }),
      (res, c) => {
        if (!res.success) {
          return c.json(
            { error: res.error.flatMap((e) => e.message).join(',') },
            400,
          );
        }
      },
    ),
    async (c) => {
      const { username } = c.req.valid('param');
      const { createdAt } = c.req.valid('query');

      const useCase = GetUserPostsUseCase.getInstance();

      return RA.flow(
        useCase.run({ username, createdAt }),
        RA.match({
          ok: ({ user, actor, following, followers, posts }) => {
            const url = new URL(c.req.url);
            const handle = `@${user.username}@${url.host}`;
            return c.json({
              user,
              actor,
              handle,
              following,
              followers,
              posts: posts.map((post) => ({
                ...post,
                content: sanitize(post.content),
              })),
            });
          },
          err: (err) => {
            return c.json({ error: err.message }, 400);
          },
        }),
      );
    },
  )
  .get(
    '/v1/thread',
    sValidator(
      'query',
      z.object({
        postId: PostId.zodType,
      }),
      (res, c) => {
        if (!res.success) {
          return c.json(
            { error: res.error.flatMap((e) => e.message).join(',') },
            400,
          );
        }
      },
    ),
    async (c) => {
      const { postId } = c.req.valid('query');

      const threadResolver = PgThreadResolver.getInstance();
      const result = await threadResolver.resolve({ postId });

      if (!result.ok) {
        return c.json({ error: String(result.err) }, 400);
      }

      const { currentPost, ancestors, descendants } = result.val;
      return c.json({
        currentPost: currentPost
          ? {
            ...currentPost,
            content: sanitize(currentPost.content),
          }
          : null,
        ancestors: ancestors.map((post) => ({
          ...post,
          content: sanitize(post.content),
        })),
        descendants: descendants.map((post) => ({
          ...post,
          content: sanitize(post.content),
        })),
      });
    },
  )
  .get('/v1/mutes', async (c) => {
    const sessionId = getCookie(c, 'sessionId');
    if (!sessionId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionIdResult = SessionId.parse(sessionId);
    if (!sessionIdResult.ok) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const useCase = GetMutesUseCase.create({
      sessionResolver: PgSessionResolver.getInstance(),
      userResolver: PgUserResolver.getInstance(),
      mutesResolverByUserId: PgMutesResolverByUserId.getInstance(),
    });

    const result = await useCase.run({
      sessionId: sessionIdResult.val,
    });

    return RA.match({
      ok: (mutes) => c.json({ mutes }),
      err: (err) => c.json({ error: `Failed to get mutes: ${JSON.stringify(err)}` }, 400),
    })(result);
  })
  .post(
    '/v1/mute',
    sValidator(
      'json',
      z.object({
        actorId: ActorId.zodType,
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { actorId } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const useCase = CreateMuteUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        muteCreatedStore: PgMuteCreatedStore.getInstance(),
        muteResolver: PgMuteResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        mutedActorId: actorId,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to mute: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  )
  .delete(
    '/v1/mute',
    sValidator(
      'json',
      z.object({
        actorId: ActorId.zodType,
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { actorId } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const useCase = DeleteMuteUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        muteDeletedStore: PgMuteDeletedStore.getInstance(),
        muteResolver: PgMuteResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        mutedActorId: actorId,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to unmute: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  )
  .post(
    '/v1/preview',
    sValidator(
      'json',
      z.object({
        markdown: z.string(),
      }),
    ),
    async (c) => {
      const { markdown } = c.req.valid('json');
      const html = await PostContent.fromMarkdown(markdown);
      return c.json({ html: sanitize(html) });
    },
  )
  .post(
    '/v1/relay',
    sValidator(
      'json',
      z.object({
        actorUri: z.string().url(),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json');
      const { actorUri } = body;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, 'sessionId')),
        RA.andThen(SessionId.parse),
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

      const useCase = SubscribeRelayUseCase.create({
        relayResolverByActorUri: PgRelayResolverByActorUri.getInstance(),
        relaySubscriptionRequestedStore: PgRelaySubscriptionRequestedStore.getInstance(),
      });

      const result = await useCase.run({
        relayActorUri: actorUri,
        ctx,
      });

      return RA.match({
        ok: (relay) => c.json({ success: true, relay }),
        err: (err) => c.json({ error: `Failed to subscribe to relay: ${JSON.stringify(err)}` }, 400),
      })(result);
    },
  );

export type APIRouterType = typeof app;
export { app as APIRouter };
