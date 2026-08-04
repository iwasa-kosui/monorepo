import {
  createFederationBuilder,
  type Federation,
  type KvStore,
  type Message,
  type MessageQueue,
} from '@fedify/fedify';
import { WorkersKvStore, WorkersMessageQueue } from '@fedify/fedify/x/cfworkers';
import type { KVNamespace, MessageBatch, Queue } from '@cloudflare/workers-types';

import { createContextLoaderFactory } from './federationContext.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

type WorkersKvStoreConstructor = new(namespace: KVNamespace) => KvStore;

type WorkersMessageQueueConstructor = new(queue: Queue) => MessageQueue;

export type CloudflareFederationDeps = Readonly<{
  origin: string;
  kv: KvStore;
  queue: MessageQueue;
}>;

const federationBuilder = createFederationBuilder<void>();

export const createCloudflareFederation = (
  deps: CloudflareFederationDeps,
): Promise<Federation<void>> =>
  federationBuilder.build({
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
  const federation = await createCloudflareFederation({
    origin: env.ORIGIN,
    kv: createWorkersKvStore(env.FEDIFY_KV),
    queue,
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

  for (const message of batch.messages) {
    try {
      await runtime.federation.processQueuedTask(
        undefined,
        message.body as Message,
      );
      message.ack();
    } catch (error) {
      console.error('Fedify queued task failed', error);
      message.retry();
    }
  }
};
