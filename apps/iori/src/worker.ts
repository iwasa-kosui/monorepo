import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import { Hono } from 'hono';

import { createPostImageR2ObjectStore } from './adaptor/r2/postImageObjectStore.ts';
import { ImageId } from './domain/image/imageId.ts';
import { processCloudflareFedifyQueueBatch } from './federation.cloudflare.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const app = new Hono<{ Bindings: IoriWorkerEnv }>();

const fetchAsset = async (
  env: IoriWorkerEnv,
  url: string,
): Promise<Response | undefined> => {
  const assetsResponse = await env.ASSETS?.fetch(url);
  if (assetsResponse === undefined || assetsResponse.status === 404) {
    return undefined;
  }

  const headers = new Headers();
  assetsResponse.headers.forEach((value, key) => headers.set(key, value));

  return new Response(assetsResponse.body as BodyInit, {
    status: assetsResponse.status,
    statusText: assetsResponse.statusText,
    headers,
  });
};

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

app.get('/', (c) =>
  c.html(
    `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>blog.kosui.me</title>
    <meta name="robots" content="noindex">
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" href="/favicon.ico">
  </head>
  <body>
    <main style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1.25rem; line-height: 1.7;">
      <h1 style="font-size: 1.75rem; margin-bottom: 1rem;">blog.kosui.me</h1>
      <p>Cloudflare Workers への移行中です。</p>
      <p>データ移行と D1 adaptor 接続が完了するまで、一部のページは利用できません。</p>
    </main>
  </body>
</html>`,
    200,
  ));

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

app.all('*', async (c) => {
  const assetsResponse = await fetchAsset(c.env, c.req.url);
  if (assetsResponse !== undefined) {
    return assetsResponse;
  }

  return c.notFound();
});

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
