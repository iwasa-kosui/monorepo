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
import { createWorkerAuthApiRouter } from './adaptor/routes/workerAuthApiRouter.ts';
import { createWorkerAuthFormRouter } from './adaptor/routes/workerAuthFormRouter.ts';
import { createWorkerCoreApiRouter } from './adaptor/routes/workerCoreApiRouter.ts';
import { createWorkerIoriActionsRouter } from './adaptor/routes/workerIoriActionsRouter.ts';
import { createWorkerIoriArticlesRouter } from './adaptor/routes/workerIoriArticlesRouter.ts';
import { createWorkerIoriBlueskyBookmarkRouter } from './adaptor/routes/workerIoriBlueskyBookmarkRouter.ts';
import { createWorkerIoriBlueskyCredentialRouter } from './adaptor/routes/workerIoriBlueskyCredentialRouter.ts';
import { createWorkerIoriBlueskyCrosspostStatusRouter } from './adaptor/routes/workerIoriBlueskyCrosspostStatusRouter.ts';
import { createWorkerIoriBlueskyModerationRouter } from './adaptor/routes/workerIoriBlueskyModerationRouter.ts';
import { createWorkerIoriBlueskyProfileRouter } from './adaptor/routes/workerIoriBlueskyProfileRouter.ts';
import { createWorkerIoriBlueskyRouter } from './adaptor/routes/workerIoriBlueskyRouter.ts';
import { createWorkerIoriDigestRouter } from './adaptor/routes/workerIoriDigestRouter.ts';
import { createWorkerIoriFediverseConversationsRouter } from './adaptor/routes/workerIoriFediverseConversationsRouter.ts';
import { createWorkerIoriSearchRouter } from './adaptor/routes/workerIoriSearchRouter.ts';
import { createWorkerIoriSummaryRouter } from './adaptor/routes/workerIoriSummaryRouter.ts';
import { createWorkerIoriXPostsRouter } from './adaptor/routes/workerIoriXPostsRouter.ts';
import { createWorkerMastodonAccountsRouter } from './adaptor/routes/workerMastodonAccountsRouter.ts';
import { createWorkerMastodonAppsRouter } from './adaptor/routes/workerMastodonAppsRouter.ts';
import { createWorkerMastodonCoreRouter } from './adaptor/routes/workerMastodonCoreRouter.ts';
import { createWorkerMastodonFallbackRouter } from './adaptor/routes/workerMastodonFallbackRouter.ts';
import { createWorkerMastodonMarkersRouter } from './adaptor/routes/workerMastodonMarkersRouter.ts';
import { createWorkerMastodonMediaRouter } from './adaptor/routes/workerMastodonMediaRouter.ts';
import { createWorkerMastodonNotificationsRouter } from './adaptor/routes/workerMastodonNotificationsRouter.ts';
import { createWorkerMastodonReportsRouter } from './adaptor/routes/workerMastodonReportsRouter.ts';
import { createWorkerMastodonStatusesRouter } from './adaptor/routes/workerMastodonStatusesRouter.ts';
import { createWorkerMastodonTimelinesRouter } from './adaptor/routes/workerMastodonTimelinesRouter.ts';
import { createWorkerMastodonTranslateRouter } from './adaptor/routes/workerMastodonTranslateRouter.ts';
import { createWorkerMastodonViewerListsRouter } from './adaptor/routes/workerMastodonViewerListsRouter.ts';
import { createWorkerOAuthRouter } from './adaptor/routes/workerOAuthRouter.ts';
import { createWorkerRemoteFollowRedirectRouter } from './adaptor/routes/workerPageActionsRouter.ts';
import { createWorkerTimelinePostingApiRouter } from './adaptor/routes/workerTimelinePostingApiRouter.ts';
import { createIoriApp } from './appFactory.tsx';
import { ArticleId } from './domain/article/articleId.ts';
import { Instant } from './domain/instant/instant.ts';
import { Session } from './domain/session/session.ts';
import { SessionId } from './domain/session/sessionId.ts';
import { Username } from './domain/user/username.ts';
import { processCloudflareFedifyQueueBatch } from './federation.cloudflare.ts';
import { withD1ReadRetry } from './runtime/d1ReadRetry.ts';
import { createD1TimingCollector, instrumentEnvD1, logD1Timing } from './runtime/d1Timing.ts';
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

const withReadRetryEnv = (env: IoriWorkerEnv): IoriWorkerEnv =>
  env.DB === undefined || env.DB === null ? env : { ...env, DB: withD1ReadRetry(env.DB) };

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
    const d1Timing = createD1TimingCollector();
    env = instrumentEnvD1(withReadRetryEnv(env), d1Timing);
    if (admission.capability === 'smoke') env = readOnlySmokeEnvironment(env);
    const runtime = await createWorkerRuntimePorts(env, (promise) => executionCtx.waitUntil(promise));

    const response = await createIoriApp({
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
          '/api',
          createWorkerAuthApiRouter({
            signInUseCase: runtime.auth.signInUseCase,
            createContext: (authRequest) => runtime.federation.createContext(authRequest, undefined),
          }),
        );
        app.route(
          '/auth',
          createWorkerAuthFormRouter({
            signInUseCase: runtime.auth.signInUseCase,
            signUpUseCase: runtime.core.signUpUseCase,
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
          createWorkerCoreApiRouter({
            ...runtime.core,
          }),
        );
        const authn = createMastodonAuthn({
          verifyAccessTokenUseCase: runtime.oauth.verifyAccessTokenUseCase,
          sessionResolver: runtime.oauth.sessionResolver,
        });
        app.route('/', createWorkerOAuthRouter(runtime.oauth));
        app.route('/api', createWorkerMastodonAppsRouter({ ...runtime.oauth, authn }));
        const createContext = (mastodonRequest: Request) =>
          runtime.federation.createContext(mastodonRequest, undefined);
        app.route(
          '/api',
          createWorkerMastodonCoreRouter({
            ...runtime.mastodon,
            authn,
            createContext,
            instance: {
              domain: admission.identity.hostname,
              title: admission.identity.hostname,
              description: SITE_DESCRIPTION,
              contactUsername: Username.parseOrThrow('kosui'),
              vapidPublicKey: runtime.core.vapidPublicKey,
              translationEnabled: runtime.textGenerator !== undefined,
            },
          }),
        );
        app.route('/api', createWorkerMastodonTimelinesRouter({ ...runtime.mastodon, authn }));
        app.route(
          '/api',
          createWorkerMastodonStatusesRouter({
            ...runtime.mastodon,
            ...runtime.socialActions,
            createPostUseCase: runtime.posting.createPostUseCase,
            remoteActorLookup: runtime.posting.remoteActorLookup,
            sendReplyUseCase: runtime.core.sendReplyUseCase,
            updatePostUseCase: runtime.core.updatePostUseCase,
            postSourceTextResolver: runtime.core.postSourceTextResolver,
            postVersionsResolver: runtime.core.postVersionsResolver,
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
            blockActor: runtime.core.blockActor,
            unblockActor: runtime.core.unblockActor,
            authn,
            createContext,
          }),
        );
        app.route(
          '/api',
          createWorkerMastodonReportsRouter({
            ...runtime.mastodon,
            reportRemoteActor: runtime.core.reportRemoteActor,
            authn,
            createContext,
          }),
        );
        app.route('/api', createWorkerMastodonViewerListsRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerIoriSearchRouter({ ...runtime.mastodon, authn, createContext }));
        app.route('/api', createWorkerIoriSummaryRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerMastodonTranslateRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerIoriDigestRouter({ ...runtime.digest, authn }));
        app.route('/api', createWorkerIoriXPostsRouter({ ...runtime.digest, authn }));
        app.route(
          '/api',
          createWorkerIoriBlueskyRouter({
            ...runtime.blueskyTimeline,
            mediaUploadResolver: runtime.mastodon.mediaUploadResolver,
            uploads: runtime.uploads,
            authn,
          }),
        );
        app.route(
          '/api',
          createWorkerIoriFediverseConversationsRouter({
            ...runtime.mastodon,
            ...runtime.fediverseConversations,
            createPostUseCase: runtime.posting.createPostUseCase,
            sendReplyUseCase: runtime.core.sendReplyUseCase,
            authn,
            createContext,
          }),
        );
        app.route('/api', createWorkerIoriBlueskyModerationRouter({ ...runtime.blueskyModeration, authn }));
        app.route('/api', createWorkerIoriBlueskyProfileRouter({ ...runtime.blueskyProfile, authn }));
        app.route('/api', createWorkerIoriBlueskyBookmarkRouter({ ...runtime.blueskyBookmark, authn }));
        app.route('/api', createWorkerIoriBlueskyCredentialRouter({ ...runtime.blueskyCredential, authn }));
        app.route('/api', createWorkerIoriBlueskyCrosspostStatusRouter({ ...runtime.blueskyCrosspostStatus, authn }));
        app.route(
          '/api',
          createWorkerIoriActionsRouter({
            ...runtime.mastodon,
            ...runtime.socialActions,
            subscribeRelayUseCase: runtime.mutesRelays.subscribeRelayUseCase,
            subscribePushUseCase: runtime.core.subscribePushUseCase,
            allRelaysResolver: runtime.mutesRelays.allRelaysResolver,
            authn,
            createContext,
          }),
        );
        app.route(
          '/api',
          createWorkerIoriArticlesRouter({
            ...runtime.articles,
            authn,
            createContext,
          }),
        );
        app.route('/api', createWorkerMastodonNotificationsRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerMastodonMarkersRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerMastodonMediaRouter({ ...runtime.mastodon, authn }));
        app.route('/api', createWorkerMastodonFallbackRouter());
      },
      serveAsset: (assetRequest) => fetchAsset(env, assetRequest.url),
      servePage: async (pageRequest) => {
        const identity = await pageIdentity(pageRequest, runtime);
        // 所有者以外には /x と Bluesky のプロフィールとフィードとメッセージの存在を見せないため、404 と同じく undefined を返す。
        const pathname = new URL(pageRequest.url).pathname;
        if (
          (pathname === '/x' || pathname === '/feeds' || pathname.startsWith('/bluesky/profile/')
            || /^\/messages(?:\/|$)/.test(pathname))
          && identity.isLoggedIn
          && !(await runtime.digest.isDigestOwner(identity.userId))
        ) return undefined;
        return createWorkerPageFallback(pageRequest, identity);
      },
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
    logD1Timing(d1Timing, request, response);
    return response;
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
        withReadRetryEnv(env),
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
      env: withReadRetryEnv(env),
      scheduledTime: new Date(controller.scheduledTime),
      waitUntil: (promise) => executionCtx.waitUntil(promise),
    });
  },
} satisfies IoriWorkerHandler;
