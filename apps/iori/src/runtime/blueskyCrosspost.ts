import { createBlueskyClient } from '../adaptor/bluesky/blueskyClient.ts';
import { createBlueskyThumbnailFetcher } from '../adaptor/bluesky/thumbnailFetcher.ts';
import { createD1BlueskyCrosspostDeletedStore } from '../adaptor/d1/blueskyCrosspost/blueskyCrosspostDeletedStore.ts';
import { createD1BlueskyCrosspostResolver } from '../adaptor/d1/blueskyCrosspost/blueskyCrosspostResolver.ts';
import { createD1BlueskyCrosspostSavedStore } from '../adaptor/d1/blueskyCrosspost/blueskyCrosspostSavedStore.ts';
import { createD1BlueskyCrosspostsResolverByRetryable } from '../adaptor/d1/blueskyCrosspost/blueskyCrosspostsResolverByRetryable.ts';
import {
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1PostImagesResolverByPostId } from '../adaptor/d1/image/postImagesResolver.ts';
import { createD1LinkPreviewsResolverByPostId } from '../adaptor/d1/linkPreview/linkPreviewsResolverByPostId.ts';
import { createD1LocalPostResolverByUri } from '../adaptor/d1/post/localPostResolverByUri.ts';
import { createD1PostResolver } from '../adaptor/d1/post/postResolver.ts';
import { createD1UserResolver } from '../adaptor/d1/user/userResolver.ts';
import { createPostImageR2ObjectStore } from '../adaptor/r2/postImageObjectStore.ts';
import { Instant } from '../domain/instant/instant.ts';
import { RemoveBlueskyCrosspostUseCase } from '../useCase/removeBlueskyCrosspost.ts';
import { RetryBlueskyCrosspostsUseCase } from '../useCase/retryBlueskyCrossposts.ts';
import { ScheduleBlueskyCrosspostUseCase } from '../useCase/scheduleBlueskyCrosspost.ts';
import { SendBlueskyCrosspostUseCase } from '../useCase/sendBlueskyCrosspost.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';

export const BLUESKY_CROSSPOST_ENABLED_VALUE = 'enabled';

export type BlueskyCredentials = Readonly<{ identifier: string; appPassword: string }>;
export type BlueskyCrosspostConfig = BlueskyCredentials;

export const resolveBlueskyCredentials = (
  env: Pick<IoriWorkerEnv, 'BLUESKY_IDENTIFIER' | 'BLUESKY_APP_PASSWORD'>,
): BlueskyCredentials | undefined => {
  const identifier = env.BLUESKY_IDENTIFIER?.trim();
  const appPassword = env.BLUESKY_APP_PASSWORD?.trim();
  return identifier === undefined || identifier === '' || appPassword === undefined || appPassword === ''
    ? undefined
    : { identifier, appPassword };
};

export const resolveBlueskyCrosspostConfig = (
  env: Pick<IoriWorkerEnv, 'IORI_BLUESKY_CROSSPOST' | 'BLUESKY_IDENTIFIER' | 'BLUESKY_APP_PASSWORD'>,
): BlueskyCrosspostConfig | undefined =>
  env.IORI_BLUESKY_CROSSPOST === BLUESKY_CROSSPOST_ENABLED_VALUE ? resolveBlueskyCredentials(env) : undefined;

export type BlueskyCrosspostUseCases = Readonly<{
  schedule: ScheduleBlueskyCrosspostUseCase;
  send: SendBlueskyCrosspostUseCase;
  remove: RemoveBlueskyCrosspostUseCase;
  retry: RetryBlueskyCrosspostsUseCase;
}>;

export const createBlueskyCrosspostUseCases = (
  env: IoriWorkerEnv,
  waitUntil: (promise: Promise<unknown>) => void,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyCrosspostUseCases | undefined => {
  const config = resolveBlueskyCrosspostConfig(env);
  if (config === undefined) return undefined;
  const db = createD1Db(env.DB);
  const now = Instant.now;
  const postResolver = createD1PostResolver(db);
  const localPostResolverByUri = createD1LocalPostResolverByUri(db, env.ORIGIN);
  const crosspostResolver = createD1BlueskyCrosspostResolver(db);
  const crosspostSavedStore = createD1BlueskyCrosspostSavedStore(db);
  const crosspostDeletedStore = createD1BlueskyCrosspostDeletedStore(db);
  const client = createBlueskyClient({
    identifier: config.identifier,
    appPassword: config.appPassword,
    sessionResolver: createD1BlueskySessionResolver(db),
    sessionStore: createD1BlueskySessionSavedStore(db),
    fetch: deps.fetch,
    now,
  });
  const send = SendBlueskyCrosspostUseCase.create({
    postResolver,
    userResolver: createD1UserResolver(db),
    localPostResolverByUri,
    postImagesResolver: createD1PostImagesResolverByPostId(db),
    linkPreviewsResolver: createD1LinkPreviewsResolverByPostId(db),
    crosspostResolver,
    crosspostSavedStore,
    crosspostDeletedStore,
    uploads: createPostImageR2ObjectStore({ bucket: env.UPLOADS }),
    thumbnailFetcher: createBlueskyThumbnailFetcher({ fetch: deps.fetch }),
    client,
    origin: env.ORIGIN,
    now,
  });
  return {
    schedule: ScheduleBlueskyCrosspostUseCase.create({
      postResolver,
      localPostResolverByUri,
      crosspostResolver,
      crosspostSavedStore,
      send,
      waitUntil,
      now,
    }),
    send,
    remove: RemoveBlueskyCrosspostUseCase.create({
      crosspostResolver,
      crosspostSavedStore,
      crosspostDeletedStore,
      client,
      waitUntil,
      now,
    }),
    retry: RetryBlueskyCrosspostsUseCase.create({
      crosspostsResolverByRetryable: createD1BlueskyCrosspostsResolverByRetryable(db),
      crosspostSavedStore,
      crosspostDeletedStore,
      client,
      send,
      now,
    }),
  };
};
