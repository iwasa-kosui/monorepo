import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import type { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { FederatedTimelineItemWithPost } from '../../domain/federatedTimeline/federatedTimelineItem.ts';
import { ImageId } from '../../domain/image/imageId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Password } from '../../domain/password/password.ts';
import type { PostWithAuthor, ThreadResolver } from '../../domain/post/post.ts';
import { PostContent } from '../../domain/post/postContent.ts';
import { PostId } from '../../domain/post/postId.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { Username } from '../../domain/user/username.ts';
import type { PostImageObjectStore } from '../../ports/postImageObjectStore.ts';
import type { DeletePostUseCase } from '../../useCase/deletePost.ts';
import type { GetFederatedTimelineUseCase } from '../../useCase/getFederatedTimeline.ts';
import type { GetServerTimelineUseCase } from '../../useCase/getServerTimeline.ts';
import type { GetUserPostsUseCase } from '../../useCase/getUserPosts.ts';
import type { SendFollowRequestUseCase } from '../../useCase/sendFollowRequest.ts';
import type { SendReplyUseCase } from '../../useCase/sendReply.ts';
import type { createSignUpUseCase } from '../../useCase/signUp.ts';
import type { SubscribePushUseCase } from '../../useCase/subscribePush.ts';
import type { UnsubscribePushUseCase } from '../../useCase/unsubscribePush.ts';
import { sanitize } from './helper/sanitize.ts';

type RemoteActorPostsResult = Readonly<{
  remoteActor: unknown;
  isFollowing: boolean;
  isMuted: boolean;
  posts: readonly PostWithAuthor[];
}>;

export type WorkerCoreApiRouterDeps = Readonly<{
  signUpUseCase: ReturnType<typeof createSignUpUseCase>;
  sendReplyUseCase: SendReplyUseCase;
  deletePostUseCase: DeletePostUseCase;
  sendFollowRequestUseCase: SendFollowRequestUseCase;
  getFederatedTimelineUseCase: GetFederatedTimelineUseCase;
  getUserPostsUseCase: GetUserPostsUseCase;
  getRemoteActorPostsUseCase: Readonly<{
    run: (
      input: Readonly<{
        sessionId: SessionId;
        actorId: ActorId;
        createdAt: Instant | undefined;
      }>,
    ) => RA<RemoteActorPostsResult, { message: string }>;
  }>;
  getServerTimelineUseCase: GetServerTimelineUseCase;
  threadResolver: ThreadResolver;
  subscribePushUseCase: SubscribePushUseCase;
  unsubscribePushUseCase: UnsubscribePushUseCase;
  uploads: PostImageObjectStore;
  vapidPublicKey: string | undefined;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

const sessionFrom = (cookie: string | undefined): SessionId | undefined => {
  const result = SessionId.parse(cookie);
  return result.ok ? result.val : undefined;
};

const sanitizePost = (post: PostWithAuthor): PostWithAuthor => ({
  ...post,
  content: sanitize(post.content),
});

const sanitizeFederatedItem = (item: FederatedTimelineItemWithPost): FederatedTimelineItemWithPost => ({
  ...item,
  post: sanitizePost(item.post),
});

export const createWorkerCoreApiRouter = (deps: WorkerCoreApiRouterDeps): Hono => {
  const app = new Hono();

  app.post(
    '/v1/sign-up',
    sValidator('json', z.object({ username: Username.zodType, password: Password.zodType })),
    async (c) => {
      const result = await deps.signUpUseCase.run({
        ...c.req.valid('json'),
        ctx: deps.createContext(c.req.raw),
      });
      return result.ok
        ? c.json({ success: true, username: result.val.user.username })
        : c.json({ error: result.err.message }, 400);
    },
  );

  app.post(
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
      const sessionId = sessionFrom(getCookie(c, 'sessionId'));
      if (sessionId === undefined) return c.json({ error: 'Invalid session' }, 401);
      const body = c.req.valid('json');
      const result = await deps.sendReplyUseCase.run({
        sessionId,
        postId: body.postId,
        content: await PostContent.fromMarkdown(body.content),
        imageUrls: body.imageUrls ?? [],
        request: c.req.raw,
        ctx: deps.createContext(c.req.raw),
      });
      return result.ok
        ? c.json({ success: true })
        : c.json({ error: `Failed to reply: ${JSON.stringify(result.err)}` }, 400);
    },
  );

  app.post('/v1/upload', async (c) => {
    const sessionId = sessionFrom(getCookie(c, 'sessionId'));
    if (sessionId === undefined) return c.json({ error: 'Unauthorized' }, 401);
    const file = (await c.req.parseBody())['file'];
    if (!(file instanceof File)) return c.json({ error: 'No file provided' }, 400);
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      return c.json({ error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' }, 400);
    }
    if (file.size > 5 * 1024 * 1024) return c.json({ error: 'File too large. Max size: 5MB' }, 400);
    const imageId = ImageId.generate();
    const stored = await deps.uploads.put({
      imageId,
      body: await file.arrayBuffer(),
      contentType: file.type,
      contentLength: file.size,
    });
    return c.json({ imageId, url: stored.url, filename: stored.url.split('/').at(-1) });
  });

  app.delete('/v1/posts/:postId', async (c) => {
    const postId = PostId.parse(c.req.param('postId'));
    if (!postId.ok) return c.json({ error: 'Invalid post ID' }, 400);
    const sessionId = sessionFrom(getCookie(c, 'sessionId'));
    if (sessionId === undefined) return c.json({ error: 'Unauthorized' }, 401);
    const result = await deps.deletePostUseCase.run({
      sessionId,
      postId: postId.val,
      ctx: deps.createContext(c.req.raw),
    });
    if (result.ok) return c.json({ success: true });
    if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
    if (result.err.type === 'PostNotFoundError') return c.json({ error: result.err.message }, 404);
    return c.json({ error: `Failed to delete: ${JSON.stringify(result.err)}` }, 400);
  });

  app.post(
    '/v1/follow',
    sValidator('json', z.object({ handle: z.string().min(1) })),
    async (c) => {
      const sessionId = sessionFrom(getCookie(c, 'sessionId'));
      if (sessionId === undefined) return c.json({ error: 'Unauthorized' }, 401);
      const result = await deps.sendFollowRequestUseCase.run({
        sessionId,
        handle: c.req.valid('json').handle,
        request: c.req.raw,
        ctx: deps.createContext(c.req.raw),
      });
      return result.ok
        ? c.json({ success: true })
        : c.json({ error: `Failed to follow: ${JSON.stringify(result.err)}` }, 400);
    },
  );

  app.get(
    '/v1/federated',
    sValidator('query', z.object({ receivedAt: z.optional(z.coerce.number().pipe(Instant.zodType)) })),
    async (c) => {
      const sessionId = sessionFrom(getCookie(c, 'sessionId'));
      if (sessionId === undefined) return c.json({ error: 'Unauthorized' }, 401);
      const result = await deps.getFederatedTimelineUseCase.run({
        sessionId,
        receivedAt: c.req.valid('query').receivedAt,
      });
      if (result.ok) {
        return c.json({ items: result.val.items.map(sanitizeFederatedItem), nextCursor: result.val.nextCursor });
      }
      deleteCookie(c, 'sessionId');
      return c.json({ error: JSON.stringify(result.err) }, 400);
    },
  );

  app.get(
    '/v1/users/:username/posts',
    sValidator('param', z.object({ username: Username.zodType })),
    sValidator('query', z.object({ createdAt: z.optional(z.coerce.number().pipe(Instant.zodType)) })),
    async (c) => {
      const result = await deps.getUserPostsUseCase.run({
        username: c.req.valid('param').username,
        createdAt: c.req.valid('query').createdAt,
      });
      if (!result.ok) return c.json({ error: result.err.message }, 400);
      const url = new URL(c.req.url);
      return c.json({
        ...result.val,
        handle: `@${result.val.user.username}@${url.host}`,
        posts: result.val.posts.map(sanitizePost),
      });
    },
  );

  app.get(
    '/v1/remote-users/:actorId/posts',
    sValidator('param', z.object({ actorId: ActorId.zodType })),
    sValidator('query', z.object({ createdAt: z.optional(z.coerce.number().pipe(Instant.zodType)) })),
    async (c) => {
      const sessionId = sessionFrom(getCookie(c, 'sessionId'));
      if (sessionId === undefined) return c.json({ error: 'Unauthorized' }, 401);
      const result = await deps.getRemoteActorPostsUseCase.run({
        sessionId,
        actorId: c.req.valid('param').actorId,
        createdAt: c.req.valid('query').createdAt,
      });
      return result.ok
        ? c.json({ ...result.val, isLoggedIn: true, posts: result.val.posts.map(sanitizePost) })
        : c.json({ error: result.err.message }, 400);
    },
  );

  app.get(
    '/v1/thread',
    sValidator('query', z.object({ postId: PostId.zodType })),
    async (c) => {
      const result = await deps.threadResolver.resolve({ postId: c.req.valid('query').postId });
      if (!result.ok) return c.json({ error: String(result.err) }, 400);
      return c.json({
        currentPost: result.val.currentPost === null ? null : sanitizePost(result.val.currentPost),
        ancestors: result.val.ancestors.map(sanitizePost),
        descendants: result.val.descendants.map(sanitizePost),
      });
    },
  );

  app.get('/v1/server-timeline', async (c) => {
    const result = await deps.getServerTimelineUseCase.run({ createdAt: undefined });
    return result.ok
      ? c.json({ posts: result.val.posts.map(sanitizePost) })
      : c.json({ error: 'Failed to load timeline' }, 500);
  });

  app.get('/v1/push/vapid-public-key', (c) =>
    deps.vapidPublicKey === undefined
      ? c.json({ error: 'Push is not configured' }, 503)
      : c.json({ publicKey: deps.vapidPublicKey }));

  app.post(
    '/v1/push/subscribe',
    sValidator(
      'json',
      z.object({
        endpoint: z.url(),
        keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
      }),
    ),
    async (c) => {
      const sessionId = sessionFrom(getCookie(c, 'sessionId'));
      if (sessionId === undefined) return c.json({ error: 'Unauthorized' }, 401);
      const body = c.req.valid('json');
      const result = await deps.subscribePushUseCase.run({
        sessionId,
        endpoint: body.endpoint,
        p256dhKey: body.keys.p256dh,
        authKey: body.keys.auth,
      });
      return result.ok ? c.json({ success: true }) : c.json({ error: result.err.message }, 400);
    },
  );

  app.delete(
    '/v1/push/subscribe',
    sValidator('json', z.object({ endpoint: z.url() })),
    async (c) => {
      const sessionId = sessionFrom(getCookie(c, 'sessionId'));
      if (sessionId === undefined) return c.json({ error: 'Unauthorized' }, 401);
      const result = await deps.unsubscribePushUseCase.run({
        sessionId,
        endpoint: c.req.valid('json').endpoint,
      });
      return result.ok ? c.json({ success: true }) : c.json({ error: result.err.message }, 400);
    },
  );

  return app;
};
