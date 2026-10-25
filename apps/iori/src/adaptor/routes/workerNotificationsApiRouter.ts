import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import { SessionId } from '../../domain/session/sessionId.ts';
import type { GetLikedPostsUseCase } from '../../useCase/getLikedPosts.ts';
import type { GetNotificationsUseCase } from '../../useCase/getNotifications.ts';
import type { GetUnreadNotificationCountUseCase } from '../../useCase/getUnreadNotificationCount.ts';
import { sanitize } from './helper/sanitize.ts';

export type WorkerNotificationsApiRouterDeps = Readonly<{
  getUnreadNotificationCountUseCase: GetUnreadNotificationCountUseCase;
  getNotificationsUseCase: GetNotificationsUseCase;
  getLikedPostsUseCase: GetLikedPostsUseCase;
}>;

export const createWorkerNotificationsApiRouter = (
  deps: WorkerNotificationsApiRouterDeps,
): Hono =>
  new Hono()
    .get('/v1/notifications/count', async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: 'Unauthorized' }, 401);
      return RA.match({
        ok: (count) => c.json({ count }),
        err: () => c.json({ error: 'Failed to get notification count' }, 400),
      })(await deps.getUnreadNotificationCountUseCase.run({ sessionId: sessionId.val }));
    })
    .get('/v1/notifications', async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: 'Unauthorized' }, 401);
      const result = await deps.getNotificationsUseCase.run({ sessionId: sessionId.val });
      if (!result.ok) return c.json({ error: 'Failed to load notifications' }, 400);
      return c.json({
        user: result.val.user,
        notifications: result.val.notifications.map((notification) => ({
          notification,
          sanitizedContent: 'likedPost' in notification
            ? sanitize(notification.likedPost.content)
            : 'reactedPost' in notification
            ? sanitize(notification.reactedPost.content)
            : 'replyPost' in notification
            ? sanitize(notification.replyPost.content)
            : '',
        })),
      });
    })
    .get('/v1/liked-posts', async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: 'Unauthorized' }, 401);
      const result = await deps.getLikedPostsUseCase.run({ sessionId: sessionId.val });
      if (!result.ok) return c.json({ error: 'Failed to load liked posts' }, 400);
      return c.json({
        user: result.val.user,
        posts: result.val.posts.map((post) => ({ ...post, content: sanitize(post.content) })),
      });
    });
