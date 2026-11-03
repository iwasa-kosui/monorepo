import type { ExecutionContext, MessageBatch, ScheduledController } from '@cloudflare/workers-types';

import { createD1ArticleResolver } from './adaptor/d1/article/articleResolver.ts';
import { createD1SessionResolver } from './adaptor/d1/session/sessionResolver.ts';
import { federationWithObjectNotFound } from './adaptor/fedify/activityPubObjectNotFound.ts';
import { generateOgImageOnDemand, type OgImageFailureLog } from './adaptor/ogImage/generateOgImageOnDemand.ts';
import { fetchOgFont } from './adaptor/ogImage/ogImageFont.ts';
import { renderWorkerOgImage } from './adaptor/ogImage/workerOgImageRenderer.ts';
import { createR2OgImageStore } from './adaptor/r2/ogImageStore.ts';
import { parseUploadFilenameImageId } from './adaptor/r2/postImageObjectStore.ts';
import { createMastodonAuthn } from './adaptor/routes/mastodonAuthn.ts';
import { createWorkerArticlesApiRouter } from './adaptor/routes/workerArticlesApiRouter.ts';
import { createWorkerAuthApiRouter } from './adaptor/routes/workerAuthApiRouter.ts';
import { createWorkerCoreApiRouter } from './adaptor/routes/workerCoreApiRouter.ts';
import { createWorkerIoriDigestRouter } from './adaptor/routes/workerIoriDigestRouter.ts';
import { createWorkerIoriSearchRouter } from './adaptor/routes/workerIoriSearchRouter.ts';
import { createWorkerIoriSummaryRouter } from './adaptor/routes/workerIoriSummaryRouter.ts';
import { createWorkerMastodonAccountsRouter } from './adaptor/routes/workerMastodonAccountsRouter.ts';
import { createWorkerMastodonAppsRouter } from './adaptor/routes/workerMastodonAppsRouter.ts';
import { createWorkerMastodonCoreRouter } from './adaptor/routes/workerMastodonCoreRouter.ts';
import { createWorkerMastodonFallbackRouter } from './adaptor/routes/workerMastodonFallbackRouter.ts';
import { createWorkerMastodonMarkersRouter } from './adaptor/routes/workerMastodonMarkersRouter.ts';
import { createWorkerMastodonMediaRouter } from './adaptor/routes/workerMastodonMediaRouter.ts';
import { createWorkerMastodonNotificationsRouter } from './adaptor/routes/workerMastodonNotificationsRouter.ts';
import { createWorkerMastodonStatusesRouter } from './adaptor/routes/workerMastodonStatusesRouter.ts';
import { createWorkerMastodonTimelinesRouter } from './adaptor/routes/workerMastodonTimelinesRouter.ts';
import { createWorkerMastodonViewerListsRouter } from './adaptor/routes/workerMastodonViewerListsRouter.ts';
import { createWorkerMutesRelaysApiRouter } from './adaptor/routes/workerMutesRelaysApiRouter.ts';
import { createWorkerOAuthRouter } from './adaptor/routes/workerOAuthRouter.ts';
import { createWorkerRemoteFollowRedirectRouter } from './adaptor/routes/workerPageActionsRouter.ts';
import { createWorkerPostsRouter } from './adaptor/routes/workerPostsRouter.tsx';
import { createWorkerSocialActionsApiRouter } from './adaptor/routes/workerSocialActionsApiRouter.ts';
import { createWorkerTimelinePostingApiRouter } from './adaptor/routes/workerTimelinePostingApiRouter.ts';
import { createIoriApp } from './appFactory.tsx';
import { ArticleId } from './domain/article/articleId.ts';
import { Instant } from './domain/instant/instant.ts';
import { Session } from './domain/session/session.ts';
import { SessionId } from './domain/session/sessionId.ts';
import { Username } from './domain/user/username.ts';
import { processCloudflareFedifyQueueBatch } from './federation.cloudflare.ts';
import { createWorkerRuntimePorts } from './runtime/workerRuntime.ts';
import { dispatchScheduled, scheduledTasks } from './scheduled/scheduledTasks.ts';
import { readOnlySmokeEnvironment } from './smokeCapabilities.ts';
import {
  admissionRejected,
  admitWorkerRequest,
  hasNoBody,
  isSmokeMarker,
  parseAdmission,
  smokeMarker,
} from './workerAdmission.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';
import { createWorkerPageFallback, SITE_DESCRIPTION } from './workerPageFallback.ts';

import './logging.cloudflare.ts';

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

const ogImageFailures: OgImageFailureLog = new Map();

type IoriWorkerHandler = Readonly<{
  fetch: (
    request: Request,
    env: IoriWorkerEnv,
    executionCtx: ExecutionContext,
  ) => Response | Promise<Response>;
  queue: (
    batch: MessageBatch<unknown>,
    env: IoriWorkerEnv,
    executionCtx: ExecutionContext,
  ) => Promise<void>;
  scheduled: (
    controller: ScheduledController,
    env: IoriWorkerEnv,
    executionCtx: ExecutionContext,
  ) => Promise<void>;
}>;

export default {
  fetch: async (
    request: Request,
    env: IoriWorkerEnv,
    executionCtx: ExecutionContext,
  ) => {
    const admission = await admitWorkerRequest(request, env);
    if (!admission) return admissionRejected();
    if (new URL(request.url).pathname === '/__smoke__/queue-enqueue') {
      if (admission.capability !== 'smoke' || request.method !== 'POST' || !hasNoBody(request)) {
        return admissionRejected();
      }
      await env.FEDIFY_QUEUE.send(smokeMarker(admission.identity));
      return Response.json({ accepted: true, queue: { enqueued: 1 } }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (admission.capability === 'smoke') env = readOnlySmokeEnvironment(env);
    const runtime = await createWorkerRuntimePorts(env, (promise) => executionCtx.waitUntil(promise));

    return createIoriApp({
      federationMiddleware: async (c, next) => {
        if (c.req.path === '/inbox' && c.req.method === 'GET') return c.json({ error: 'Method Not Allowed' }, 405);
        return federationWithObjectNotFound(runtime.federation, () => undefined)(c, next);
      },
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
        app.get('/digest', async (c) => {
          const identity = await pageIdentity(c.req.raw, runtime);
          if (!identity.isLoggedIn) return c.redirect('/sign-in');
          const latest = await runtime.digest.digestResolverByUserId.resolve(identity.userId);
          return c.redirect(latest.ok && latest.val !== undefined ? `/articles/${latest.val.articleId}` : '/articles');
        });
        app.all('/__smoke__/*', (c) => c.notFound());
        app.route('/users', createWorkerRemoteFollowRedirectRouter());
        app.route(
          '/posts',
          createWorkerPostsRouter({
            createPostUseCase: runtime.posting.createPostUseCase,
            createContext: (postRequest) => runtime.federation.createContext(postRequest, undefined),
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
            createContext: (coreRequest) => runtime.federation.createContext(coreRequest, undefined),
          }),
        );
        const authn = createMastodonAuthn({
          verifyAccessTokenUseCase: runtime.oauth.verifyAccessTokenUseCase,
          sessionResolver: runtime.oauth.sessionResolver,
        });
        app.route('/', createWorkerOAuthRouter(runtime.oauth));
        app.route('/api', createWorkerMastodonAppsRouter({ ...runtime.oauth, authn }));
        app.route(
          '/api',
          createWorkerMastodonCoreRouter({
            ...runtime.mastodon,
            authn,
            instance: {
              domain: admission.identity.hostname,
              title: admission.identity.hostname,
              description: SITE_DESCRIPTION,
              contactUsername: Username.parseOrThrow('kosui'),
              vapidPublicKey: runtime.core.vapidPublicKey,
            },
          }),
        );
        app.route('/api', createWorkerMastodonTimelinesRouter({ ...runtime.mastodon, authn }));
        const createContext = (mastodonRequest: Request) =>
          runtime.federation.createContext(mastodonRequest, undefined);
        app.route(
          '/api',
          createWorkerMastodonStatusesRouter({
            ...runtime.mastodon,
            ...runtime.socialActions,
            createPostUseCase: runtime.posting.createPostUseCase,
            sendReplyUseCase: runtime.core.sendReplyUseCase,
            deletePostUseCase: runtime.core.deletePostUseCase,
            authn,
            createContext,
          }),
        );
        app.route(
          '/api',
          createWorkerMastodonAccountsRouter({
            ...runtime.mastodon,
            createMuteUseCase: runtime.mutesRelays.createMuteUseCase,
            deleteMuteUseCase: runtime.mutesRelays.deleteMuteUseCase,
            followRemoteActor: runtime.core.followRemoteActor,
            unfollowRemoteActor: runtime.core.unfollowRemoteActor,
            authn,
            createContext,
          }),
        );
        app.route('/api', createWorkerMastodonViewerListsRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerIoriSearchRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerIoriSummaryRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerIoriDigestRouter({ ...runtime.digest, authn }));
        app.route('/api', createWorkerMastodonNotificationsRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerMastodonMarkersRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerMastodonMediaRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerMastodonFallbackRouter());
      },
      serveAsset: (assetRequest) => fetchAsset(env, assetRequest.url),
      servePage: async (pageRequest) => createWorkerPageFallback(pageRequest, await pageIdentity(pageRequest, runtime)),
      serveUpload: async (filename) => {
        const imageIdResult = parseUploadFilenameImageId(filename);
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
            'X-Content-Type-Options': 'nosniff',
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

        const articleResolver = createD1ArticleResolver(runtime.db);
        const generated = await generateOgImageOnDemand({
          store: createR2OgImageStore(env.UPLOADS),
          resolvePublishedTitle: async (id) => {
            const article = await articleResolver.resolve(id);
            if (!article.ok) return { status: 'failed', error: article.err };
            return article.val?.status === 'published'
              ? { status: 'published', title: article.val.title }
              : { status: 'notFound' };
          },
          loadFont: (text) => fetchOgFont({ text }),
          render: renderWorkerOgImage,
          now: Date.now,
          failures: ogImageFailures,
        })(articleId.val);
        if (generated.status === 'found') return generated.response;
        if (generated.status === 'notFound') return new Response('Not Found', { status: 404 });
        return new Response('Service Unavailable', {
          status: 503,
          headers: { 'Retry-After': '60', 'Cache-Control': 'public, max-age=60' },
        });
      },
    }).fetch(request as unknown as Request, env, executionCtx);
  },
  queue: async (
    batch: MessageBatch<unknown>,
    env: IoriWorkerEnv,
    executionCtx: ExecutionContext,
  ): Promise<void> => {
    const identity = parseAdmission(env);
    if (
      !identity || identity.mode !== 'active'
      || batch.queue !== `iori-${identity.environment}-${identity.generation}-fedify`
    ) {
      batch.retryAll();
      return;
    }
    const messages = batch.messages.filter((message) => {
      if (isSmokeMarker(message.body, identity)) {
        message.ack();
        return false;
      }
      // Fedify ignores unknown types successfully; reserved malformed markers must never be implicitly acknowledged.
      if (
        message.body !== null && typeof message.body === 'object' && Reflect.get(message.body, 'type') === 'iori-smoke'
      ) {
        message.retry();
        return false;
      }
      return true;
    });
    if (messages.length > 0) {
      await processCloudflareFedifyQueueBatch(
        { ...batch, messages },
        env,
        (promise) => executionCtx.waitUntil(promise),
      );
    }
  },
  scheduled: async (
    controller: ScheduledController,
    env: IoriWorkerEnv,
    executionCtx: ExecutionContext,
  ): Promise<void> => {
    const identity = parseAdmission(env);
    if (!identity || identity.mode !== 'active') {
      console.info('iori scheduled: skipped because admission is not active.', {
        cron: controller.cron,
        mode: identity?.mode,
      });
      return;
    }
    await dispatchScheduled(controller.cron, scheduledTasks, {
      env,
      scheduledTime: new Date(controller.scheduledTime),
      waitUntil: (promise) => executionCtx.waitUntil(promise),
    });
  },
} satisfies IoriWorkerHandler;
