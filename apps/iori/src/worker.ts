import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import { federation } from '@fedify/hono';

import { createD1ActorResolverByUserId } from './adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1LogoUriUpdatedStore } from './adaptor/d1/actor/logoUriUpdatedStore.ts';
import { createD1SessionResolver } from './adaptor/d1/session/sessionResolver.ts';
import { createR2OgImageStore } from './adaptor/r2/ogImageStore.ts';
import { createWorkerArticlesApiRouter } from './adaptor/routes/workerArticlesApiRouter.ts';
import { createWorkerAuthApiRouter } from './adaptor/routes/workerAuthApiRouter.ts';
import { createWorkerCoreApiRouter } from './adaptor/routes/workerCoreApiRouter.ts';
import { createWorkerMutesRelaysApiRouter } from './adaptor/routes/workerMutesRelaysApiRouter.ts';
import { createWorkerNotificationsApiRouter } from './adaptor/routes/workerNotificationsApiRouter.ts';
import {
  createWorkerPageActionsRouter,
  createWorkerRemoteFollowRedirectRouter,
} from './adaptor/routes/workerPageActionsRouter.ts';
import { createWorkerSocialActionsApiRouter } from './adaptor/routes/workerSocialActionsApiRouter.ts';
import { createWorkerTimelinePostingApiRouter } from './adaptor/routes/workerTimelinePostingApiRouter.ts';
import { createWorkerUsersRouter } from './adaptor/routes/workerUsersRouter.ts';
import { createIoriApp } from './appFactory.tsx';
import { Actor } from './domain/actor/actor.ts';
import { ArticleId } from './domain/article/articleId.ts';
import { ImageId } from './domain/image/imageId.ts';
import { Instant } from './domain/instant/instant.ts';
import { Session } from './domain/session/session.ts';
import { SessionId } from './domain/session/sessionId.ts';
import { processCloudflareFedifyQueueBatch } from './federation.cloudflare.ts';
import { createWorkerRuntimePorts } from './runtime/workerRuntime.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';
import { createWorkerPageFallback } from './workerPageFallback.ts';

const pageIdentity = async (
  request: Request,
  runtime: Awaited<ReturnType<typeof createWorkerRuntimePorts>>,
) => {
  const match = /(?:^|;\s*)sessionId=([^;]+)/.exec(request.headers.get('Cookie') ?? '');
  const sessionId = SessionId.parse(match?.[1]);
  if (!sessionId.ok) return { isLoggedIn: false } as const;
  const session = await createD1SessionResolver(runtime.db).resolve(sessionId.val);
  if (!session.ok || session.val === undefined || !Session.verify(session.val, Instant.now())) {
    return { isLoggedIn: false } as const;
  }
  return { isLoggedIn: true, userId: session.val.userId } as const;
};

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

const stagingSmokeQueueMarker = Object.freeze({
  type: 'iori-smoke',
  marker: 'staging-queue-enqueue',
});

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

export default {
  fetch: async (
    request: Request,
    env: IoriWorkerEnv,
    executionCtx: ExecutionContext,
  ) => {
    const runtime = await createWorkerRuntimePorts(env);

    return createIoriApp({
      federationMiddleware: federation(runtime.federation, () => undefined),
      registerRoutes: (app) => {
        app.get('/readyz', async (c) => {
          try {
            const [database, _r2, _kv, manifest] = await Promise.all([
              env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>(),
              env.UPLOADS.head('__iori_readiness__'),
              env.FEDIFY_KV.get('__iori_readiness__'),
              fetchAsset(env, new URL('/manifest.json', c.req.url).href),
            ]);
            const bindings = {
              database: database?.ok === 1,
              r2: typeof env.UPLOADS.get === 'function' && typeof env.UPLOADS.put === 'function',
              kv: typeof env.FEDIFY_KV.get === 'function',
              queue: typeof env.FEDIFY_QUEUE.send === 'function',
              assets: manifest?.status === 200,
              auth: typeof env.VAPID_PUBLIC_KEY === 'string' && typeof env.VAPID_PRIVATE_KEY === 'string',
            };
            return c.json(
              { ok: Object.values(bindings).every(Boolean), bindings },
              bindings.database && bindings.r2
                && bindings.kv && bindings.queue && bindings.assets && bindings.auth
                ? 200
                : 503,
            );
          } catch {
            return c.json({ ok: false, error: 'Readiness check failed.' }, 503);
          }
        });
        app.get('/authorize_interaction', (c) => {
          const url = new URL(c.req.url);
          url.pathname = '/follow';
          return c.redirect(url);
        });
        if (typeof env.SMOKE_QUEUE_TOKEN === 'string' && env.SMOKE_QUEUE_TOKEN.length > 0) {
          app.post('/__smoke__/queue-enqueue', async (c) => {
            if (c.req.header('x-iori-smoke-token') !== env.SMOKE_QUEUE_TOKEN) {
              return c.json({ error: 'Unauthorized' }, 401);
            }
            await env.FEDIFY_QUEUE.send(stagingSmokeQueueMarker);
            return c.json({ accepted: true, queue: { enqueued: 1 } });
          });
        }
        app.all('/__smoke__/*', (c) => c.notFound());
        app.route('/users', createWorkerRemoteFollowRedirectRouter());
        app.route(
          '/users',
          createWorkerUsersRouter({
            updateLogoUri: async ({ sessionId, logoUri }) => {
              const session = await createD1SessionResolver(runtime.db).resolve(sessionId);
              if (!session.ok || session.val === undefined || !Session.verify(session.val, Instant.now())) return false;
              const actor = await createD1ActorResolverByUserId(runtime.db).resolve(session.val.userId);
              if (!actor.ok || actor.val === undefined) return false;
              if (actor.val.logoUri === logoUri) return true;
              const stored = await createD1LogoUriUpdatedStore(runtime.db).store(
                Actor.updateLogoUri(Instant.now())(actor.val, logoUri),
              );
              return stored.ok;
            },
          }),
        );
        app.route(
          '/remote-users',
          createWorkerPageActionsRouter({
            followRemoteActor: runtime.core.followRemoteActor,
            unfollowRemoteActor: runtime.core.unfollowRemoteActor,
            createContext: (actionRequest) => runtime.federation.createContext(actionRequest, undefined),
          }),
        );
        app.route(
          '/api',
          createWorkerAuthApiRouter({
            signInUseCase: runtime.auth.signInUseCase,
            createContext: (authRequest) => runtime.federation.createContext(authRequest, undefined),
          }),
        );
        app.route(
          '/api',
          createWorkerTimelinePostingApiRouter({
            getTimelineUseCase: runtime.timeline.getTimelineUseCase,
            createPostUseCase: runtime.posting.createPostUseCase,
            createContext: (timelineRequest) => runtime.federation.createContext(timelineRequest, undefined),
          }),
        );
        app.route(
          '/api',
          createWorkerSocialActionsApiRouter({
            ...runtime.socialActions,
            createContext: (socialRequest) => runtime.federation.createContext(socialRequest, undefined),
          }),
        );
        app.route(
          '/api',
          createWorkerNotificationsApiRouter(runtime.notifications),
        );
        app.route(
          '/api',
          createWorkerArticlesApiRouter({
            ...runtime.articles,
            createContext: (articleRequest) => runtime.federation.createContext(articleRequest, undefined),
          }),
        );
        app.route(
          '/api',
          createWorkerMutesRelaysApiRouter({
            ...runtime.mutesRelays,
            createContext: (relayRequest) => runtime.federation.createContext(relayRequest, undefined),
          }),
        );
        app.route(
          '/api',
          createWorkerCoreApiRouter({
            ...runtime.core,
            uploads: runtime.uploads,
            createContext: (coreRequest) => runtime.federation.createContext(coreRequest, undefined),
          }),
        );
      },
      serveAsset: (assetRequest) => fetchAsset(env, assetRequest.url),
      servePage: async (pageRequest) => createWorkerPageFallback(pageRequest, await pageIdentity(pageRequest, runtime)),
      serveUpload: async (filename) => {
        const imageIdSource = filename.replace(/\.(?:gif|jpe?g|png|webp)$/i, '');
        const imageIdResult = ImageId.parse(imageIdSource);
        if (!imageIdResult.ok) {
          return undefined;
        }

        const object = await runtime.uploads.get(imageIdResult.val);
        if (object === undefined) {
          return undefined;
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
      },
      serveOgImage: async (ogImageRequest) => {
        const pathname = new URL(ogImageRequest.url).pathname;
        const match = /^\/api\/og\/articles\/([^/]+)$/.exec(pathname);
        if (match === null) {
          return new Response('Not Found', { status: 404 });
        }

        const articleId = ArticleId.parse(match[1]);
        if (!articleId.ok) {
          return new Response('Not Found', { status: 404 });
        }

        const store = createR2OgImageStore(env.UPLOADS);
        const stored = await store.get(articleId.val);
        if (stored !== undefined) return stored;
        return new Response('Not Found', { status: 404 });
      },
    }).fetch(request as unknown as Request, env, executionCtx);
  },
  queue: async (
    batch: MessageBatch<unknown>,
    env: IoriWorkerEnv,
  ): Promise<void> => {
    await processCloudflareFedifyQueueBatch(batch, env);
  },
} satisfies IoriWorkerHandler;
