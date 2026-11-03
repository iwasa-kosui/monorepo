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
  type MessageQueueEnqueueOptions,
  Note,
  Undo,
} from '@fedify/fedify';
import { WorkersKvStore, WorkersMessageQueue } from '@fedify/fedify/x/cfworkers';

import { createD1ActorResolverByUserId } from './adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1ActorsResolverByFollowingId } from './adaptor/d1/actor/actorsResolverByFollowingId.ts';
import { createD1ArticleResolver } from './adaptor/d1/article/articleResolver.ts';
import { createD1ArticleBodyResolver } from './adaptor/d1/articleBody/articleBodyResolver.ts';
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
import { IORI_VERSION } from './adaptor/mastodon/ioriVersion.ts';
import { buildNodeInfo } from './adaptor/mastodon/nodeinfo.ts';
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

const QUEUE_FAILURE_MESSAGE_LIMIT = 500;

const describeQueueFailure = (error: unknown): Readonly<{ name: string; message: string } | { thrownType: string }> =>
  error instanceof Error
    ? { name: error.name, message: error.message.slice(0, QUEUE_FAILURE_MESSAGE_LIMIT) }
    : { thrownType: typeof error };

export type WaitUntil = (promise: Promise<unknown>) => void;

const keepAlive = (waitUntil: WaitUntil, send: Promise<void>): Promise<void> => {
  // Fedify は fanout の enqueue を await しないため、応答後も完了を待たせる
  waitUntil(send.catch((error: unknown) => console.error('Fedify queue send failed.', describeQueueFailure(error))));
  return send;
};

const QUEUE_BATCH_MAX_MESSAGES = 100;
const QUEUE_BATCH_MAX_BYTES = 240_000;
const QUEUE_MESSAGE_MAX_BYTES = 120_000;
const QUEUE_MESSAGE_OVERHEAD_BYTES = 256;

const textEncoder = new TextEncoder();

const estimateMessageBytes = (message: Message): number =>
  textEncoder.encode(JSON.stringify(message)).byteLength + QUEUE_MESSAGE_OVERHEAD_BYTES;

const dropIfTooLarge = (message: Message, bytes: number): boolean => {
  if (bytes <= QUEUE_MESSAGE_MAX_BYTES) return false;
  console.error('Fedify queue message too large; dropped.', {
    bytes,
    type: message.type,
    id: message.id,
    ...('activityType' in message ? { activityType: message.activityType } : {}),
    ...('activityId' in message ? { activityId: message.activityId } : {}),
  });
  return true;
};

// Cloudflare Queues の sendBatch は100件かつ256,000 bytes までに制限される
const splitIntoBatches = (messages: readonly Message[]): Message[][] => {
  const batches: Message[][] = [];
  let current: Message[] = [];
  let currentBytes = 0;
  for (const message of messages) {
    const bytes = estimateMessageBytes(message);
    if (dropIfTooLarge(message, bytes)) continue;
    if (
      current.length > 0
      && (current.length >= QUEUE_BATCH_MAX_MESSAGES || currentBytes + bytes > QUEUE_BATCH_MAX_BYTES)
    ) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(message);
    currentBytes += bytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
};

const createWorkersMessageQueue = (
  env: Pick<IoriWorkerEnv, 'FEDIFY_QUEUE'>,
  waitUntil: WaitUntil,
): MessageQueue => {
  const queue = new (WorkersMessageQueue as unknown as WorkersMessageQueueConstructor)(env.FEDIFY_QUEUE);
  const enqueue = async (message: Message, options?: MessageQueueEnqueueOptions): Promise<void> => {
    if (dropIfTooLarge(message, estimateMessageBytes(message))) return;
    await queue.enqueue(message, options);
  };
  const enqueueMany = async (messages: readonly Message[], options?: MessageQueueEnqueueOptions): Promise<void> => {
    const batches = splitIntoBatches(messages);
    for (const [index, batch] of batches.entries()) {
      try {
        await queue.enqueueMany!(batch, options);
      } catch (error) {
        console.error('Fedify queue batch send failed.', {
          sentBatches: index,
          totalBatches: batches.length,
          ...describeQueueFailure(error),
        });
        throw error;
      }
    }
  };
  return {
    nativeRetrial: queue.nativeRetrial,
    enqueue: (message, options) => keepAlive(waitUntil, enqueue(message, options)),
    enqueueMany: (messages, options) => keepAlive(waitUntil, enqueueMany(messages, options)),
    listen: (handler, options) => queue.listen(handler, options),
  };
};

export const createCloudflareFederationRuntime = async (
  env: IoriWorkerEnv,
  waitUntil: WaitUntil,
) => {
  const queue = createWorkersMessageQueue(env, waitUntil);
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
    articleBodyResolver: createD1ArticleBodyResolver(db),
  });
  const keyPairsDispatcher = createKeyPairsDispatcher({
    keyGenerator: FedifyKeyGenerator.getInstance(),
    keyGeneratedStore: createD1KeyGeneratedStore(db),
    keysResolverByUserId: createD1KeysResolverByUserId(db),
    userResolverByUsername,
    instanceActorKeyPairsResolver: createD1InstanceActorKeyPairsResolver(db),
  });

  federationBuilder.setNodeInfoDispatcher('/nodeinfo/2.1', () => buildNodeInfo(IORI_VERSION));
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
  waitUntil: WaitUntil,
): Promise<void> => {
  const runtime = await createCloudflareFederationRuntime(env, waitUntil);

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
    } catch (error) {
      console.error('Fedify queued task failed.', describeQueueFailure(error));
      message.retry();
    }
  }
};
