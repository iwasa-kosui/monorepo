import { Hono } from 'hono';
import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';

import { createPostImageR2ObjectStore } from './adaptor/r2/postImageObjectStore.ts';
import { ImageId } from './domain/image/imageId.ts';
import { processCloudflareFedifyQueueBatch } from './federation.cloudflare.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const app = new Hono<{ Bindings: IoriWorkerEnv }>();

type IoriWorkerHandler = Readonly<{
  fetch: (
    request: Request,
    env: IoriWorkerEnv,
    executionCtx: ExecutionContext,
  ) => Response | Promise<Response>;
  queue: (
    batch: MessageBatch<unknown>,
    env: IoriWorkerEnv,
  ) => Promise<void>;
}>;

app.get('/healthz', (c) =>
  c.json({
    ok: true,
    service: 'iori',
  }));

app.get('/health', (c) => c.text('OK'));

app.get('/uploads/:filename', async (c) => {
  const filename = c.req.param('filename');
  const imageIdSource = filename.endsWith('.webp')
    ? filename.slice(0, -'.webp'.length)
    : filename;
  const imageIdResult = ImageId.parse(imageIdSource);
  if (!imageIdResult.ok) {
    return c.notFound();
  }

  const store = createPostImageR2ObjectStore({
    bucket: c.env.UPLOADS,
  });
  const object = await store.get(imageIdResult.val);
  if (object === undefined) {
    return c.notFound();
  }

  return new Response(object.body as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': object.contentType,
      ...(object.cacheControl === undefined
        ? {}
        : { 'Cache-Control': object.cacheControl }),
    },
  });
});

app.all('*', (c) =>
  c.json(
    {
      error: 'iori Cloudflare Worker migration shell',
    },
    501,
  ));

export default {
  fetch: (
    request: Request,
    env: IoriWorkerEnv,
    executionCtx: ExecutionContext,
  ) => app.fetch(request as unknown as Request, env, executionCtx),
  queue: async (
    batch: MessageBatch<unknown>,
    env: IoriWorkerEnv,
  ): Promise<void> => {
    await processCloudflareFedifyQueueBatch(batch, env);
  },
} satisfies IoriWorkerHandler;
