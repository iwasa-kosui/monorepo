import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import { SessionId } from '../../domain/session/sessionId.ts';
import type { GetLikedPostsUseCase } from '../../useCase/getLikedPosts.ts';
import { sanitize } from './helper/sanitize.ts';

export type WorkerNotificationsApiRouterDeps = Readonly<{
  getLikedPostsUseCase: GetLikedPostsUseCase;
}>;

export const createWorkerNotificationsApiRouter = (
  deps: WorkerNotificationsApiRouterDeps,
): Hono =>
  new Hono()
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
