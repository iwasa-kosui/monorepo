import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createActorDispatcher } from './adaptor/fedify/actorDispatcherFactory.ts';
import { createOutboxDispatcher } from './adaptor/fedify/outboxDispatcherFactory.ts';
import { ActorId } from './domain/actor/actorId.ts';
import { Instant } from './domain/instant/instant.ts';
import { Post } from './domain/post/post.ts';
import { UserId } from './domain/user/userId.ts';
import { Username } from './domain/user/username.ts';
import {
  createCloudflareFederation,
  createCloudflareFederationRuntime,
  processCloudflareFedifyMessages,
} from './federation.cloudflare.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const workerEnv = {
  DB: {} as never,
  FEDIFY_KV: {} as never,
  FEDIFY_QUEUE: {} as never,
  UPLOADS: {} as never,
  ORIGIN: 'https://worker.example.invalid',
  VAPID_SUBJECT: 'mailto:admin@example.invalid',
} satisfies IoriWorkerEnv;

const parseRuntimePath = async (path: string) => {
  const { federation } = await createCloudflareFederationRuntime(workerEnv);
  const context = federation.createContext(new URL(workerEnv.ORIGIN), undefined);
  return context.parseUri(new URL(`${workerEnv.ORIGIN}${path}`));
};

describe('createCloudflareFederation', () => {
  it('builds a federation with Cloudflare stores', async () => {
    const federation = await createCloudflareFederation({
      origin: 'https://worker.example.invalid',
      kv: {} as never,
      queue: {} as never,
    });

    expect(federation).toBeDefined();
  });

  it('dispatches actor and outbox resources using public user paths', async () => {
    const userId = UserId.generate();
    const actorId = ActorId.generate();
    const username = Username.orThrow('kosui');
    const actor = {
      id: actorId,
      userId,
      type: 'local' as const,
      uri: 'https://worker.example.invalid/users/kosui',
      inboxUrl: 'https://worker.example.invalid/users/kosui/inbox',
    };
    const post = Post.createPost(Instant.now())({
      actorId,
      userId,
      content: 'Hello ActivityPub',
    }).aggregateState;
    const context = {
      getActorKeyPairs: async () => [],
      getActorUri: (identifier: string) => new URL(`https://worker.example.invalid/users/${identifier}`),
      getInboxUri: (identifier?: string) =>
        new URL(`https://worker.example.invalid${identifier === undefined ? '/inbox' : `/users/${identifier}/inbox`}`),
      getOutboxUri: (identifier: string) => new URL(`https://worker.example.invalid/users/${identifier}/outbox`),
      getFollowersUri: (identifier: string) => new URL(`https://worker.example.invalid/users/${identifier}/followers`),
      getObjectUri: (_type: unknown, values: { identifier: string; id: string }) =>
        new URL(`https://worker.example.invalid/users/${values.identifier}/posts/${values.id}`),
    };
    const userResolverByUsername = { resolve: async () => RA.ok({ id: userId, username }) };
    const actorResolverByUserId = { resolve: async () => RA.ok(actor) };
    const actorDispatcher = createActorDispatcher({ userResolverByUsername, actorResolverByUserId });
    const outboxDispatcher = createOutboxDispatcher({
      userResolverByUsername,
      actorResolverByUserId,
      postsResolverByActorId: { resolve: async () => RA.ok([post]) },
    });

    const dispatchedActor = await actorDispatcher.dispatch(context as never, 'kosui');
    const outbox = await outboxDispatcher.dispatch(context as never, 'kosui');

    expect(dispatchedActor?.id?.href).toBe('https://worker.example.invalid/users/kosui');
    expect(outbox.items).toHaveLength(1);
    expect(outbox.items[0]?.objectId?.href).toBe(`https://worker.example.invalid/users/kosui/posts/${post.postId}`);
  });
});

describe('createCloudflareFederationRuntime', () => {
  it.each(
    [
      ['/users/kosui', 'actor'],
      ['/users/kosui/followers', 'followers'],
      ['/users/kosui/outbox', 'outbox'],
      ['/users/kosui/inbox', 'inbox'],
      ['/inbox', 'inbox'],
      ['/users/kosui/posts/019aeb2e-9841-7b49-8329-b144ed0a5a7f', 'object'],
      ['/users/kosui/articles/019aeb2e-9841-7b49-8329-b144ed0a5a7f', 'object'],
    ] as const,
  )('registers the Worker-compatible ActivityPub route %s', async (path, type) => {
    const parsed = await parseRuntimePath(path);

    expect(parsed?.type).toBe(type);
  });
});

describe('processCloudflareFedifyMessages', () => {
  it('acks successful messages and retries failures', async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await processCloudflareFedifyMessages({
      messages: [{ body: { ok: true }, ack }, { body: { fail: true }, retry }],
    } as never, async (message) => {
      if ((message as { fail?: boolean }).fail) throw new Error('fixture failure');
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('Fedify queued task failed.');
    error.mockRestore();
  });
});
