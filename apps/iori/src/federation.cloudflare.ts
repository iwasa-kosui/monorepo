import type { KVNamespace, MessageBatch, Queue } from '@cloudflare/workers-types';
import {
  Accept,
  Activity,
  Announce,
  Article,
  Create,
  createFederationBuilder,
  Delete,
  type Federation,
  Follow,
  type KvStore,
  Like,
  type Message,
  type MessageQueue,
  Note,
  Undo,
} from '@fedify/fedify';
import { WorkersKvStore, WorkersMessageQueue } from '@fedify/fedify/x/cfworkers';

import { createD1ActorResolverByUserId } from './adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1ActorsResolverByFollowingId } from './adaptor/d1/actor/actorsResolverByFollowingId.ts';
import { createD1ArticleResolver } from './adaptor/d1/article/articleResolver.ts';
import { createD1Db } from './adaptor/d1/client.ts';
import { createD1PostImagesResolverByPostId } from './adaptor/d1/image/postImagesResolver.ts';
import { createD1InstanceActorKeyPairsResolver } from './adaptor/d1/key/instanceActorKeyPairsResolver.ts';
import { createD1KeyGeneratedStore } from './adaptor/d1/key/keyGeneratedStore.ts';
import { createD1KeysResolverByUserId } from './adaptor/d1/key/keysResolverByUserId.ts';
import { createD1PostResolver } from './adaptor/d1/post/postResolver.ts';
import { createD1PostsResolverByActorId } from './adaptor/d1/post/postsResolverByActorId.ts';
import { createD1ThreadResolver } from './adaptor/d1/post/threadResolver.ts';
import { createD1UserResolverByUsername } from './adaptor/d1/user/userResolverByUsername.ts';
import { createActorDispatcher } from './adaptor/fedify/actorDispatcherFactory.ts';
import { createFollowersCounter, createFollowersDispatcher } from './adaptor/fedify/followersDispatcherFactory.ts';
import { createCloudflareInboxListener } from './adaptor/fedify/inboxListener/cloudflareInboxListener.ts';
import { FedifyKeyGenerator } from './adaptor/fedify/keyGenerator.ts';
import { createKeyPairsDispatcher } from './adaptor/fedify/keyPairsDispatcherFactory.ts';
import { createObjectDispatcher } from './adaptor/fedify/objectDispatcherFactory.ts';
import { createOutboxDispatcher } from './adaptor/fedify/outboxDispatcherFactory.ts';
import { SharedKeyDispatcher } from './adaptor/fedify/sharedKeyDispatcher.ts';
import { createContextLoaderFactory } from './federationContext.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

type WorkersKvStoreConstructor = new(namespace: KVNamespace) => KvStore;

type WorkersMessageQueueConstructor = new(queue: Queue) => MessageQueue;

export type CloudflareFederationDeps = Readonly<{
  origin: string;
  kv: KvStore;
  queue: MessageQueue;
}>;

export const createCloudflareFederation = (
  deps: CloudflareFederationDeps,
): Promise<Federation<void>> =>
  createFederationBuilder<void>().build({
    kv: deps.kv,
    queue: deps.queue,
    origin: deps.origin,
    contextLoaderFactory: createContextLoaderFactory(),
  });

const createWorkersKvStore = (kv: KVNamespace): KvStore =>
  new (WorkersKvStore as unknown as WorkersKvStoreConstructor)(kv);

const createWorkersMessageQueue = (env: Pick<IoriWorkerEnv, 'FEDIFY_QUEUE'>): MessageQueue =>
  new (WorkersMessageQueue as unknown as WorkersMessageQueueConstructor)(env.FEDIFY_QUEUE);

export const createCloudflareFederationRuntime = async (
  env: IoriWorkerEnv,
) => {
  const queue = createWorkersMessageQueue(env);
  const db = createD1Db(env.DB);
  const userResolverByUsername = createD1UserResolverByUsername(db);
  const actorResolverByUserId = createD1ActorResolverByUserId(db);
  const actorsResolverByFollowingId = createD1ActorsResolverByFollowingId(db);
  const actorDeps = { userResolverByUsername, actorResolverByUserId };
  const followersDeps = { ...actorDeps, actorsResolverByFollowingId };
  const federationBuilder = createFederationBuilder<void>();
  const actorDispatcher = createActorDispatcher(actorDeps);
  const followersDispatcher = createFollowersDispatcher(followersDeps);
  const outboxDispatcher = createOutboxDispatcher({
    ...actorDeps,
    postsResolverByActorId: createD1PostsResolverByActorId(db),
  });
  const objectDispatcher = createObjectDispatcher({
    origin: env.ORIGIN,
    postResolver: createD1PostResolver(db),
    postImagesResolver: createD1PostImagesResolverByPostId(db),
    articleResolver: createD1ArticleResolver(db),
    threadResolver: createD1ThreadResolver(db, env.ORIGIN),
  });
  const keyPairsDispatcher = createKeyPairsDispatcher({
    keyGenerator: FedifyKeyGenerator.getInstance(),
    keyGeneratedStore: createD1KeyGeneratedStore(db),
    keysResolverByUserId: createD1KeysResolverByUserId(db),
    userResolverByUsername,
    instanceActorKeyPairsResolver: createD1InstanceActorKeyPairsResolver(db),
  });

  federationBuilder.setObjectDispatcher(Note, '/users/{identifier}/posts/{id}', objectDispatcher.ofNote);
  federationBuilder.setObjectDispatcher(Article, '/users/{identifier}/articles/{id}', objectDispatcher.ofArticle);
  const inboxListener = createCloudflareInboxListener(db, {
    origin: env.ORIGIN,
    vapidSubject: env.VAPID_SUBJECT,
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY,
  });
  federationBuilder.setInboxListeners('/users/{identifier}/inbox', '/inbox')
    .setSharedKeyDispatcher(SharedKeyDispatcher.getInstance().dispatch)
    .on(Accept, inboxListener.onAccept)
    .on(Follow, inboxListener.onFollow)
    .on(Undo, inboxListener.onUndo)
    .on(Create, inboxListener.onCreate)
    .on(Delete, inboxListener.onDelete)
    .on(Like, inboxListener.onLike)
    .on(Announce, inboxListener.onAnnounce)
    .on(Activity, inboxListener.onActivity);
  federationBuilder.setFollowersDispatcher('/users/{identifier}/followers', followersDispatcher.dispatch)
    .setCounter(createFollowersCounter(followersDeps));
  federationBuilder.setOutboxDispatcher('/users/{identifier}/outbox', outboxDispatcher.dispatch);
  federationBuilder.setActorDispatcher('/users/{identifier}', actorDispatcher.dispatch)
    .setKeyPairsDispatcher(keyPairsDispatcher.dispatch);

  const federation = await federationBuilder.build({
    origin: env.ORIGIN,
    kv: createWorkersKvStore(env.FEDIFY_KV),
    queue,
    // Cloudflare invokes the Worker queue handler, which in turn calls
    // processQueuedTask().  WorkersMessageQueue deliberately cannot listen.
    manuallyStartQueue: true,
    contextLoaderFactory: createContextLoaderFactory(),
  });

  return {
    federation,
    queue,
  } as const;
};

export const processCloudflareFedifyQueueBatch = async (
  batch: MessageBatch<unknown>,
  env: IoriWorkerEnv,
): Promise<void> => {
  const runtime = await createCloudflareFederationRuntime(env);

  await processCloudflareFedifyMessages(
    batch,
    (message) => runtime.federation.processQueuedTask(undefined, message),
  );
};

export const processCloudflareFedifyMessages = async (
  batch: MessageBatch<unknown>,
  processTask: (message: Message) => Promise<void>,
): Promise<void> => {
  for (const message of batch.messages) {
    try {
      await processTask(message.body as Message);
      message.ack();
    } catch {
      console.error('Fedify queued task failed.');
      message.retry();
    }
  }
};
