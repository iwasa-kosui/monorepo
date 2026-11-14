import type { RequestContext } from '@fedify/fedify';
import { Result } from '@iwasa-kosui/result';
import { type Context, Hono } from 'hono';
import { z } from 'zod/v4';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { PostsWithAuthorResolverByPostIds, PostWithAuthor } from '../../domain/post/post.ts';
import { PostContent } from '../../domain/post/postContent.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { AllRelaysResolver } from '../../domain/relay/relay.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { FetchRemoteContextUseCase } from '../../useCase/fetchRemoteContext.ts';
import type { FetchRemoteOutboxUseCase } from '../../useCase/fetchRemoteOutbox.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { ListRemoteActorFollowsUseCase } from '../../useCase/listRemoteActorFollows.ts';
import type { SendEmojiReactUseCase } from '../../useCase/sendEmojiReact.ts';
import type { SubscribePushUseCase } from '../../useCase/subscribePush.ts';
import type { SubscribeRelayUseCase } from '../../useCase/subscribeRelay.ts';
import type { UndoEmojiReactUseCase } from '../../useCase/undoEmojiReact.ts';
import type { InferUseCaseError } from '../../useCase/useCase.ts';
import type { Account } from '../mastodon/entities.ts';
import { type StatusAssembler, StatusAssemblyError } from '../mastodon/statusAssembler.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { readRequestBody } from './helper/requestBody.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriActionsRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  statusAssembler: StatusAssembler;
  sendEmojiReactUseCase: SendEmojiReactUseCase;
  undoEmojiReactUseCase: UndoEmojiReactUseCase;
  fetchRemoteContextUseCase: FetchRemoteContextUseCase;
  fetchRemoteOutboxUseCase: FetchRemoteOutboxUseCase;
  listRemoteActorFollowsUseCase: ListRemoteActorFollowsUseCase;
  subscribeRelayUseCase: SubscribeRelayUseCase;
  subscribePushUseCase: SubscribePushUseCase;
  allRelaysResolver: AllRelaysResolver;
  isDigestOwner: IsDigestOwner;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

export type IoriRemoteContextResponse = Readonly<{ fetched: number }>;
export type IoriRemoteStatusesResponse = Readonly<{ fetched: number }>;
export type IoriRemoteFollowsResponse = Readonly<{
  accounts: readonly Account[];
  next_cursor: string | null;
  total_items: number | null;
}>;

type ActingOnPost = Readonly<{ userId: UserId; viewerActorId: ActorId; post: PostWithAuthor; emoji: string }>;

const invalidToken = { error: 'The access token is invalid' } as const;
const recordNotFound = { error: 'Record not found' } as const;
const forbidden = { error: 'Forbidden' } as const;
const read = Scope.orThrow('read');
const write = Scope.orThrow('write');
const writeStatuses = Scope.orThrow('write:statuses');
const readAccounts = Scope.orThrow('read:accounts');
const remoteFollowKindSchema = z.enum(['followers', 'following']);
const cursorSchema = z.url().max(2048);
const writeFavourites = Scope.orThrow('write:favourites');
const push = Scope.orThrow('push');
const emojiSchema = z.string().min(1).max(128);
const urlSchema = z.string().url();
const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const validationFailed = (field: string) => ({ error: `Validation failed: ${field}` }) as const;

type ReactionActionError = Exclude<
  InferUseCaseError<SendEmojiReactUseCase> | InferUseCaseError<UndoEmojiReactUseCase>,
  Readonly<{ type: 'AlreadyReactedError' | 'EmojiReactNotFoundError' }>
>;

const failed = (c: Context, err: ReactionActionError): Response => {
  switch (err.type) {
    case 'PostNotFoundError':
      return c.json(recordNotFound, 404);
    case 'UserNotFoundError':
    case 'SessionExpiredError':
      return c.json(invalidToken, 401);
    case 'RemoteNoteLookupError':
      return c.json({ error: 'The remote server could not be reached' }, 502);
    default: {
      const unhandled: never = err;
      throw new Error(`The reaction action failed: ${JSON.stringify(unhandled)}`);
    }
  }
};

export const createWorkerIoriActionsRouter = ({
  authn,
  actorResolverByUserId,
  postsWithAuthorResolverByPostIds,
  statusAssembler,
  sendEmojiReactUseCase,
  undoEmojiReactUseCase,
  fetchRemoteContextUseCase,
  fetchRemoteOutboxUseCase,
  listRemoteActorFollowsUseCase,
  subscribeRelayUseCase,
  subscribePushUseCase,
  allRelaysResolver,
  isDigestOwner,
  createContext,
}: WorkerIoriActionsRouterDeps): Hono<MastodonAuthEnv> => {
  const isOwner = (c: Context<MastodonAuthEnv>) => isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined);

  const resolvePost = async (id: PostId, viewerActorId: ActorId): Promise<PostWithAuthor | undefined> => {
    const posts = await postsWithAuthorResolverByPostIds.resolve({
      postIds: [id],
      currentActorId: viewerActorId,
      onlyVisibleToViewer: true,
    });
    if (!posts.ok) {
      throw new StatusAssemblyError('Failed to resolve the status');
    }
    return posts.val.get(id);
  };

  const resolveActingPost = async (c: Context<MastodonAuthEnv>): Promise<Result<ActingOnPost, Response>> => {
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) {
      return Result.err(c.json(invalidToken, 401));
    }
    const emoji = emojiSchema.safeParse(c.req.param('emoji'));
    if (!emoji.success) {
      return Result.err(c.json(validationFailed('emoji'), 422));
    }
    const id = PostId.parse(c.req.param('id'));
    if (!id.ok) {
      return Result.err(c.json(recordNotFound, 404));
    }
    const viewer = await actorResolverByUserId.resolve(userId);
    if (!viewer.ok) {
      return Result.err(c.json(internalServerError, 500));
    }
    if (viewer.val === undefined) {
      return Result.err(c.json(actorNotFound, 422));
    }
    const post = await resolvePost(id.val, viewer.val.id);
    return post === undefined
      ? Result.err(c.json(recordNotFound, 404))
      : Result.ok({ userId, viewerActorId: viewer.val.id, post, emoji: emoji.data });
  };

  const respondWithStatus = async (
    c: Context<MastodonAuthEnv>,
    { viewerActorId, post }: ActingOnPost,
  ): Promise<Response> => {
    const updated = await resolvePost(post.postId, viewerActorId);
    if (updated === undefined) {
      return c.json(recordNotFound, 404);
    }
    const [status] = await statusAssembler.assemble({
      sources: [{ type: 'post', post: updated }],
      viewerActorId,
      requestUrl: c.req.url,
    });
    return status === undefined ? c.json(recordNotFound, 404) : c.json(status);
  };

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .post('/iori/v1/preview', authn.requireUser(writeStatuses), async (c) => {
      const markdown = (await readRequestBody(c)).markdown;
      if (typeof markdown !== 'string') {
        return c.json(validationFailed('markdown'), 422);
      }
      return c.json({ html: await PostContent.fromMarkdown(markdown) });
    })
    .put('/iori/v1/statuses/:id/reactions/:emoji', authn.requireUser(writeFavourites), async (c) => {
      const acting = await resolveActingPost(c);
      if (!acting.ok) {
        return acting.err;
      }
      const { userId, post, emoji } = acting.val;
      const reacted = await sendEmojiReactUseCase.run({
        userId,
        postId: post.postId,
        emoji,
        request: c.req.raw,
        ctx: createContext(c.req.raw),
      });
      return !reacted.ok && reacted.err.type !== 'AlreadyReactedError'
        ? failed(c, reacted.err)
        : respondWithStatus(c, acting.val);
    })
    .delete('/iori/v1/statuses/:id/reactions/:emoji', authn.requireUser(writeFavourites), async (c) => {
      const acting = await resolveActingPost(c);
      if (!acting.ok) {
        return acting.err;
      }
      const { userId, post, emoji } = acting.val;
      const undone = await undoEmojiReactUseCase.run({
        userId,
        postId: post.postId,
        emoji,
        request: c.req.raw,
        ctx: createContext(c.req.raw),
      });
      return !undone.ok && undone.err.type !== 'EmojiReactNotFoundError'
        ? failed(c, undone.err)
        : respondWithStatus(c, acting.val);
    })
    .post('/iori/v1/statuses/:id/remote-context', authn.requireUser(writeStatuses), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const id = PostId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const viewer = await actorResolverByUserId.resolve(userId);
      if (!viewer.ok) {
        return c.json(internalServerError, 500);
      }
      if (viewer.val === undefined) {
        return c.json(actorNotFound, 422);
      }
      const post = await resolvePost(id.val, viewer.val.id);
      if (post === undefined) {
        return c.json(recordNotFound, 404);
      }
      const fetched = await fetchRemoteContextUseCase.run({
        userId,
        postId: post.postId,
        ctx: createContext(c.req.raw),
      });
      if (!fetched.ok) {
        return fetched.err.type === 'PostNotFoundError' ? c.json(recordNotFound, 404) : c.json(invalidToken, 401);
      }
      return c.json({ fetched: fetched.val.fetchedCount } satisfies IoriRemoteContextResponse);
    })
    .post('/iori/v1/accounts/:id/remote-statuses', authn.requireUser(writeStatuses), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const id = ActorId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const fetched = await fetchRemoteOutboxUseCase.run({
        userId,
        actorId: id.val,
        ctx: createContext(c.req.raw),
      });
      if (!fetched.ok) {
        return fetched.err.type === 'ActorNotFoundError' ? c.json(recordNotFound, 404) : c.json(invalidToken, 401);
      }
      return c.json({ fetched: fetched.val.fetchedCount } satisfies IoriRemoteStatusesResponse);
    })
    .get('/iori/v1/accounts/:id/remote-follows/:kind', authn.requireUser(readAccounts), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const id = ActorId.parse(c.req.param('id'));
      const kind = remoteFollowKindSchema.safeParse(c.req.param('kind'));
      if (!id.ok || !kind.success) {
        return c.json(recordNotFound, 404);
      }
      const rawCursor = c.req.query('cursor');
      const cursor = rawCursor === undefined ? undefined : cursorSchema.safeParse(rawCursor);
      if (cursor !== undefined && !cursor.success) {
        return c.json(validationFailed('cursor'), 422);
      }
      const listed = await listRemoteActorFollowsUseCase.run({
        userId,
        actorId: id.val,
        kind: kind.data,
        cursor: cursor?.data,
        ctx: createContext(c.req.raw),
      });
      if (!listed.ok) {
        return listed.err.type === 'ActorNotFoundError' ? c.json(recordNotFound, 404) : c.json(invalidToken, 401);
      }
      const accounts = await statusAssembler.assembleAccounts({ actorIds: listed.val.actorIds, requestUrl: c.req.url });
      return c.json(
        {
          accounts,
          next_cursor: listed.val.nextCursor ?? null,
          total_items: listed.val.totalItems ?? null,
        } satisfies IoriRemoteFollowsResponse,
      );
    })
    .get('/iori/v1/relays', authn.requireUser(read), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      const relays = await allRelaysResolver.resolve();
      return relays.ok ? c.json({ relays: relays.val }) : c.json(internalServerError, 500);
    })
    .post('/iori/v1/relays', authn.requireUser(write), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      const url = urlSchema.safeParse((await readRequestBody(c)).url);
      if (!url.success) {
        return c.json(validationFailed('url'), 422);
      }
      const subscribed = await subscribeRelayUseCase.run({
        relayActorUri: url.data,
        ctx: createContext(c.req.raw),
      });
      return subscribed.ok
        ? c.json({ success: true, relay: subscribed.val })
        : c.json({ error: `Failed to subscribe to relay: ${JSON.stringify(subscribed.err)}` }, 400);
    })
    .post('/iori/v1/push/subscribe', authn.requireUser(push), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const subscription = pushSubscriptionSchema.safeParse(await readRequestBody(c));
      if (!subscription.success) {
        return c.json(validationFailed('subscription'), 422);
      }
      const subscribed = await subscribePushUseCase.run({
        userId,
        endpoint: subscription.data.endpoint,
        p256dhKey: subscription.data.keys.p256dh,
        authKey: subscription.data.keys.auth,
      });
      return subscribed.ok ? c.json({ success: true }) : c.json({ error: subscribed.err.message }, 400);
    });
};
