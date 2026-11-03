import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { ImageId } from '../../domain/image/imageId.ts';
import { Password } from '../../domain/password/password.ts';
import { PostContent } from '../../domain/post/postContent.ts';
import { PostId } from '../../domain/post/postId.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { Username } from '../../domain/user/username.ts';
import type { PostImageObjectStore } from '../../ports/postImageObjectStore.ts';
import type { DeletePostUseCase } from '../../useCase/deletePost.ts';
import type { SendFollowRequestUseCase } from '../../useCase/sendFollowRequest.ts';
import type { SendReplyUseCase } from '../../useCase/sendReply.ts';
import type { createSignUpUseCase } from '../../useCase/signUp.ts';
import type { SubscribePushUseCase } from '../../useCase/subscribePush.ts';
import type { UnsubscribePushUseCase } from '../../useCase/unsubscribePush.ts';

export type WorkerCoreApiRouterDeps = Readonly<{
  signUpUseCase: ReturnType<typeof createSignUpUseCase>;
  sendReplyUseCase: SendReplyUseCase;
  deletePostUseCase: DeletePostUseCase;
  sendFollowRequestUseCase: SendFollowRequestUseCase;
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
