import type { RA } from '@iwasa-kosui/result';
import { type Context, Hono } from 'hono';

import type {
  BlueskyChatMember,
  BlueskyChatMessage,
  BlueskyChatMessageInvalid,
  BlueskyChatTextMessage,
} from '../../domain/blueskyChat/blueskyChat.ts';
import type { BlueskyLoginFailureResolver } from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import {
  type BlueskyConnectionStatus,
  type BlueskySyncStatusResolver,
  toBlueskyConnectionStatus,
} from '../../domain/blueskySyncStatus/blueskySyncStatus.ts';
import type { BlueskyLikeTargetNotFound } from '../../domain/blueskyTimeline/blueskyLike.ts';
import type { BlueskyQuoteNotAllowed, BlueskyQuoteTargetNotFound } from '../../domain/blueskyTimeline/blueskyQuote.ts';
import type { BlueskyReplyNotAllowed, BlueskyReplyTargetNotFound } from '../../domain/blueskyTimeline/blueskyReply.ts';
import type { BlueskyRepostTargetNotFound } from '../../domain/blueskyTimeline/blueskyRepost.ts';
import {
  BLUESKY_TIMELINE_DEFAULT_LIMIT,
  BLUESKY_TIMELINE_MAX_LIMIT,
  type BlueskyTimelineEmbed,
  type BlueskyTimelineFacet,
  type BlueskyTimelineItem,
  type BlueskyTimelineItemsResolver,
} from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import { blueskyPostUriPattern } from '../../helper/blueskyUrl.ts';
import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type {
  BlueskyPostThreadFetcher,
  BlueskyPostThreadUnavailable,
  BlueskyThreadNode,
} from '../../ports/blueskyPostThreadFetcher.ts';
import type { BlueskySearch, BlueskySearchedActor } from '../../ports/blueskySearch.ts';
import type { BlueskyChatConvoSummary, BlueskyChatUseCases } from '../../useCase/blueskyChat.ts';
import type { BlueskyPostInvalid } from '../../useCase/helper/publishBlueskyPost.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { LikeBlueskyPostUseCase } from '../../useCase/likeBlueskyPost.ts';
import type { MarkBlueskyNotificationsSeenUseCase } from '../../useCase/markBlueskyNotificationsSeen.ts';
import type { QuoteBlueskyPostUseCase } from '../../useCase/quoteBlueskyPost.ts';
import type { ReplyToBlueskyPostUseCase } from '../../useCase/replyToBlueskyPost.ts';
import type { RepostBlueskyPostUseCase } from '../../useCase/repostBlueskyPost.ts';
import type { UndoRepostBlueskyPostUseCase } from '../../useCase/undoRepostBlueskyPost.ts';
import type { UnlikeBlueskyPostUseCase } from '../../useCase/unlikeBlueskyPost.ts';
import { BLUESKY_LOGIN_RETRY_COOLDOWN_MS } from '../bluesky/blueskyClient.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriBlueskyRouterDeps = Readonly<{
  authn: MastodonAuthn;
  blueskyTimelineItemsResolver: BlueskyTimelineItemsResolver;
  blueskyTimelineEnabled: boolean;
  blueskySyncStatusResolver: BlueskySyncStatusResolver;
  blueskyLoginFailureResolver: BlueskyLoginFailureResolver;
  now?: () => Instant;
  likeBlueskyPostUseCase: LikeBlueskyPostUseCase | undefined;
  unlikeBlueskyPostUseCase: UnlikeBlueskyPostUseCase | undefined;
  repostBlueskyPostUseCase: RepostBlueskyPostUseCase | undefined;
  undoRepostBlueskyPostUseCase: UndoRepostBlueskyPostUseCase | undefined;
  blueskyPostThreadFetcher: BlueskyPostThreadFetcher | undefined;
  replyToBlueskyPostUseCase: ReplyToBlueskyPostUseCase | undefined;
  quoteBlueskyPostUseCase: QuoteBlueskyPostUseCase | undefined;
  markBlueskyNotificationsSeenUseCase: MarkBlueskyNotificationsSeenUseCase | undefined;
  blueskySearch: BlueskySearch | undefined;
  blueskyChat: BlueskyChatUseCases | undefined;
  viewerDid: (() => RA<string, BlueskyClientError>) | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export type IoriBlueskyTimelineItemBody = Readonly<{
  feedItemId: string;
  uri: string;
  cid: string;
  authorDid: string;
  authorHandle: string;
  authorDisplayName: string | null;
  authorAvatar: string | null;
  text: string;
  facets: readonly BlueskyTimelineFacet[];
  embed: BlueskyTimelineEmbed | null;
  replyParentUri: string | null;
  replyParentAuthorHandle: string | null;
  repostedByDid: string | null;
  repostedByHandle: string | null;
  postedAt: number;
  indexedAt: number;
  liked: boolean;
  reposted: boolean;
  isOwn: boolean;
}>;

export type IoriBlueskyTimelineResponse = Readonly<{
  enabled: boolean;
  items: readonly IoriBlueskyTimelineItemBody[];
  nextBefore: number | null;
  nextBeforeId: string | null;
}>;

export type IoriBlueskyThreadNodeBody =
  | Readonly<{ kind: 'post'; item: IoriBlueskyTimelineItemBody }>
  | Readonly<{ kind: 'notFound'; uri: string }>
  | Readonly<{ kind: 'blocked'; uri: string }>;

export type IoriBlueskyThreadResponse = Readonly<{
  ancestors: readonly IoriBlueskyThreadNodeBody[];
  post: IoriBlueskyTimelineItemBody;
  replies: readonly Readonly<{ depth: number; node: IoriBlueskyThreadNodeBody }>[];
}>;

export type IoriBlueskyChatMemberBody = BlueskyChatMember;

export type IoriBlueskyChatMessageBody = BlueskyChatMessage;

export type IoriBlueskyChatConvoBody = BlueskyChatConvoSummary;

export type IoriBlueskyChatConvosResponse = Readonly<{
  convos: readonly IoriBlueskyChatConvoBody[];
  cursor: string | null;
}>;

export type IoriBlueskyChatConvoResponse = Readonly<{ convo: IoriBlueskyChatConvoBody }>;

export type IoriBlueskyChatMessagesResponse = Readonly<{
  messages: readonly IoriBlueskyChatMessageBody[];
  cursor: string | null;
  order: 'oldest_first';
}>;

export type IoriBlueskyChatSendMessageRequest = Readonly<{ text: string }>;

export type IoriBlueskyChatSendMessageResponse = Readonly<{ message: BlueskyChatTextMessage }>;

export type IoriBlueskyChatReadRequest = Readonly<{ messageId?: string }>;

export type IoriBlueskyChatReadResponse = Readonly<{ convo: IoriBlueskyChatConvoBody }>;

export type IoriBlueskyChatOpenRequest = Readonly<{ did: string }>;

export type IoriBlueskyChatOpenResponse = Readonly<{ convoId: string }>;

export type IoriBlueskyChatUnreadCountResponse = Readonly<{ unread: number; requests: number }>;

export type IoriBlueskyChatErrorBody =
  | Readonly<{ error: 'chat_not_permitted' }>
  | Readonly<{ error: 'InvalidConvo' }>
  | Readonly<{ error: BlueskyChatRejection }>
  | Readonly<{ error: 'Validation failed: text'; reason: BlueskyChatMessageInvalid['reason'] }>;

type IsoInstant = string | null;

export type IoriBlueskyScopeStatusBody = Readonly<{
  state: BlueskyConnectionStatus['timeline']['state'];
  lastSucceededAt: IsoInstant;
  lastFailedAt: IsoInstant;
  failureKind: BlueskyConnectionStatus['timeline']['failureKind'];
  failureCode: string | null;
}>;

export type IoriBlueskyStatusResponse =
  | Readonly<{ enabled: false }>
  | Readonly<{
    enabled: true;
    timeline: IoriBlueskyScopeStatusBody;
    notifications: IoriBlueskyScopeStatusBody;
    login: Readonly<{ state: 'ok' }> | Readonly<{ state: 'waiting'; failedAt: string; retryAt: string }>;
  }>;

export type IoriBlueskyActorBody = BlueskySearchedActor;

export type IoriBlueskySearchPostsResponse = Readonly<{
  items: readonly IoriBlueskyTimelineItemBody[];
  cursor: string | null;
}>;

export type IoriBlueskySearchActorsResponse = Readonly<{
  actors: readonly IoriBlueskyActorBody[];
  cursor: string | null;
}>;

export type IoriBlueskyLikeResponse = Readonly<{ liked: boolean }>;

export type IoriBlueskyRepostResponse = Readonly<{ reposted: boolean }>;

export type IoriBlueskyReplyResponse = Readonly<{ uri: string; cid: string }>;

export type IoriBlueskyQuoteResponse = Readonly<{ uri: string; cid: string }>;
export type IoriBlueskyPostTargetBody = Readonly<{ feedItemId: string }> | Readonly<{ uri: string }>;

export type IoriBlueskyLikeRequest = IoriBlueskyPostTargetBody;

export type IoriBlueskyRepostRequest = IoriBlueskyPostTargetBody;

export type IoriBlueskyReplyRequest = IoriBlueskyPostTargetBody & Readonly<{ text: string }>;

export type IoriBlueskyNotificationsSeenRequest = Readonly<{ seenAt: string }>;

const readStatuses = Scope.orThrow('read:statuses');
const readSearch = Scope.orThrow('read:search');
const writeFavourites = Scope.orThrow('write:favourites');
const writeStatuses = Scope.orThrow('write:statuses');
const writeNotifications = Scope.orThrow('write:notifications');
const integerPattern = /^\d+$/;
const didPattern = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;
const BLUESKY_CHAT_REJECTIONS = [
  'MessagesDisabled',
  'NotFollowedBySender',
  'BlockedActor',
  'BlockedSubject',
  'RecipientNotFound',
  'AccountSuspended',
  'ConvoLocked',
] as const;
type BlueskyChatRejection = typeof BLUESKY_CHAT_REJECTIONS[number];
const isoInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const forbidden = { error: 'Forbidden' } as const;
const SEARCH_LIMIT = 25;
const SEARCH_QUERY_MAX_LENGTH = 300;

const postTargetOf = (
  feedItemId: string | undefined,
  uri: string | undefined,
): { target: IoriBlueskyPostTargetBody } | { invalid: 'feedItemId' | 'uri' } => {
  if (feedItemId !== undefined && uri !== undefined) return { invalid: 'uri' };
  if (uri !== undefined) return blueskyPostUriPattern.test(uri) ? { target: { uri } } : { invalid: 'uri' };
  return feedItemId === undefined || feedItemId === '' ? { invalid: 'feedItemId' } : { target: { feedItemId } };
};

export const toItemBody = (item: BlueskyTimelineItem, viewerDid: string | undefined): IoriBlueskyTimelineItemBody => ({
  feedItemId: item.feedItemId,
  uri: item.uri,
  cid: item.cid,
  authorDid: item.authorDid,
  authorHandle: item.authorHandle,
  authorDisplayName: item.authorDisplayName,
  authorAvatar: item.authorAvatar,
  text: item.text,
  facets: item.facets,
  embed: item.embed,
  replyParentUri: item.replyParentUri,
  replyParentAuthorHandle: item.replyParentAuthorHandle,
  repostedByDid: item.repostedByDid,
  repostedByHandle: item.repostedByHandle,
  postedAt: item.postedAt,
  indexedAt: item.indexedAt,
  liked: item.liked,
  reposted: item.reposted,
  isOwn: viewerDid !== undefined && item.authorDid === viewerDid,
});

const toNodeBody = (node: BlueskyThreadNode, viewerDid: string | undefined): IoriBlueskyThreadNodeBody =>
  node.kind === 'post' ? { kind: 'post', item: toItemBody(node.item, viewerDid) } : node;

export const resolveViewerDid = async (
  viewerDid: (() => RA<string, BlueskyClientError>) | undefined,
): Promise<string | undefined> => {
  if (viewerDid === undefined) return undefined;
  const resolved = await viewerDid();
  return resolved.ok ? resolved.val : undefined;
};

const threadFailure = (c: Context, error: BlueskyClientError | BlueskyPostThreadUnavailable) => {
  if (error.type === 'BlueskyPostThreadUnavailable') {
    return c.json({ error: 'Record not found', code: error.reason === 'blocked' ? 'blocked' : 'not_found' }, 404);
  }
  if (error.status === 429) return c.json({ error: 'Bluesky rate limited' }, 429);
  return error.code === 'NotFound'
    ? c.json({ error: 'Record not found', code: 'not_found' }, 404)
    : c.json({ error: 'Bluesky request failed' }, 502);
};

const iso = (at: number | null): IsoInstant => at === null ? null : new Date(at).toISOString();

const toScopeBody = (scope: BlueskyConnectionStatus['timeline']): IoriBlueskyScopeStatusBody => ({
  state: scope.state,
  lastSucceededAt: iso(scope.lastSucceededAt),
  lastFailedAt: iso(scope.lastFailedAt),
  failureKind: scope.failureKind,
  failureCode: scope.failureCode,
});

export const clientFailure = (c: Context, error: BlueskyClientError) =>
  c.json({ error: error.kind === 'auth' ? 'Bluesky login failed' : 'Bluesky request failed' }, 502);
const toActorBody = (actor: BlueskySearchedActor): IoriBlueskyActorBody => ({
  did: actor.did,
  handle: actor.handle,
  displayName: actor.displayName,
  avatar: actor.avatar,
  description: actor.description,
  followedByMe: actor.followedByMe,
});

const searchInput = (c: Context): { q: string; cursor: string | undefined } | undefined => {
  const q = c.req.query('q')?.trim() ?? '';
  if (q === '' || q.length > SEARCH_QUERY_MAX_LENGTH) return undefined;
  const cursor = c.req.query('cursor');
  return { q, cursor: cursor === undefined || cursor === '' ? undefined : cursor };
};

const searchFailure = (c: Context, error: BlueskyClientError) => {
  if (error.status === 429) return c.json({ error: 'Bluesky rate limited' }, 429);
  if (error.kind === 'auth') return c.json({ error: 'Bluesky authentication failed', code: 'auth' }, 502);
  return c.json({ error: 'Bluesky request failed', code: 'unavailable' }, 502);
};

const likeFailure = (c: Context, error: BlueskyClientError | BlueskyLikeTargetNotFound) =>
  error.type === 'BlueskyLikeTargetNotFound'
    ? c.json({ error: 'Record not found' }, 404)
    : clientFailure(c, error);

const repostFailure = (c: Context, error: BlueskyClientError | BlueskyRepostTargetNotFound) =>
  error.type === 'BlueskyRepostTargetNotFound'
    ? c.json({ error: 'Record not found' }, 404)
    : clientFailure(c, error);

const replyFailure = (
  c: Context,
  error: BlueskyClientError | BlueskyPostInvalid | BlueskyReplyTargetNotFound | BlueskyReplyNotAllowed,
) => {
  if (error.type === 'BlueskyReplyTargetNotFound') return c.json({ error: 'Record not found' }, 404);
  if (error.type === 'BlueskyReplyNotAllowed') return c.json({ error: 'Reply not allowed' }, 422);
  if (error.type === 'BlueskyPostInvalid') {
    return c.json({ error: 'Validation failed: text', reason: error.reason }, 400);
  }
  return c.json({ error: 'Bluesky request failed' }, 502);
};

const quoteFailure = (
  c: Context,
  error: BlueskyClientError | BlueskyPostInvalid | BlueskyQuoteTargetNotFound | BlueskyQuoteNotAllowed,
) => {
  if (error.type === 'BlueskyQuoteTargetNotFound') return c.json({ error: 'Record not found' }, 404);
  if (error.type === 'BlueskyQuoteNotAllowed') return c.json({ error: 'Quote not allowed' }, 422);
  if (error.type === 'BlueskyPostInvalid') {
    return c.json({ error: 'Validation failed: text', reason: error.reason }, 400);
  }
  return c.json({ error: 'Bluesky request failed' }, 502);
};

const chatRejectionOf = (code: string | undefined): BlueskyChatRejection | undefined =>
  BLUESKY_CHAT_REJECTIONS.find((rejection) => rejection === code);

const chatFailure = (c: Context, error: BlueskyClientError | BlueskyChatMessageInvalid) => {
  if (error.type === 'BlueskyChatMessageInvalid') {
    return c.json({ error: 'Validation failed: text', reason: error.reason } satisfies IoriBlueskyChatErrorBody, 422);
  }
  if (error.kind === 'chat_not_permitted') {
    return c.json({ error: 'chat_not_permitted' } satisfies IoriBlueskyChatErrorBody, 403);
  }
  if (error.code === 'InvalidConvo') {
    return c.json({ error: 'InvalidConvo' } satisfies IoriBlueskyChatErrorBody, 404);
  }
  const rejection = chatRejectionOf(error.code);
  return rejection === undefined
    ? clientFailure(c, error)
    : c.json({ error: rejection } satisfies IoriBlueskyChatErrorBody, 422);
};

const cursorOf = (c: Context): string | undefined => {
  const cursor = c.req.query('cursor');
  return cursor === undefined || cursor === '' ? undefined : cursor;
};

export const createWorkerIoriBlueskyRouter = ({
  authn,
  blueskyTimelineItemsResolver,
  blueskyTimelineEnabled,
  blueskySyncStatusResolver,
  blueskyLoginFailureResolver,
  now = Instant.now,
  likeBlueskyPostUseCase,
  unlikeBlueskyPostUseCase,
  repostBlueskyPostUseCase,
  undoRepostBlueskyPostUseCase,
  blueskyPostThreadFetcher,
  replyToBlueskyPostUseCase,
  quoteBlueskyPostUseCase,
  markBlueskyNotificationsSeenUseCase,
  blueskySearch,
  blueskyChat,
  viewerDid,
  isDigestOwner,
}: WorkerIoriBlueskyRouterDeps): Hono<MastodonAuthEnv> => {
  const chatAccess = async (c: Context): Promise<BlueskyChatUseCases | Response> => {
    if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
    return blueskyChat ?? c.json({ error: 'Bluesky timeline is disabled' }, 409);
  };
  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/bluesky/timeline', authn.requireUser(readStatuses), async (c) => {
      const limitParam = c.req.query('limit');
      if (limitParam !== undefined && (!integerPattern.test(limitParam) || Number(limitParam) < 1)) {
        return c.json({ error: 'Validation failed: limit' }, 400);
      }
      const limit = limitParam === undefined
        ? BLUESKY_TIMELINE_DEFAULT_LIMIT
        : Math.min(Number(limitParam), BLUESKY_TIMELINE_MAX_LIMIT);
      const beforeParam = c.req.query('before');
      const before = beforeParam === undefined || !integerPattern.test(beforeParam)
        ? undefined
        : Instant.of(Number(beforeParam));
      if (beforeParam !== undefined && (before === undefined || !before.ok)) {
        return c.json({ error: 'Validation failed: before' }, 400);
      }
      const beforeId = c.req.query('beforeId');
      if (beforeId !== undefined && (beforeId === '' || before === undefined)) {
        return c.json({ error: 'Validation failed: beforeId' }, 400);
      }
      const scope = c.req.query('scope');
      if (scope !== undefined && scope !== 'home') {
        return c.json({ error: 'Validation failed: scope' }, 400);
      }
      const enabled = blueskyTimelineEnabled;
      const isOwner = await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined);
      if (scope === undefined && !isOwner) return c.json(forbidden, 403);
      if (scope === 'home' && !isOwner) {
        return c.json(
          { enabled, items: [], nextBefore: null, nextBeforeId: null } satisfies IoriBlueskyTimelineResponse,
        );
      }
      const resolved = await blueskyTimelineItemsResolver.resolve({
        limit: limit + 1,
        before: before?.ok ? before.val : undefined,
        beforeId,
        excludeCrossposted: scope === 'home',
      });
      if (!resolved.ok) return c.json(internalServerError, 500);
      const page = resolved.val.slice(0, limit);
      const last = resolved.val.length > limit ? page.at(-1) : undefined;
      const viewer = await resolveViewerDid(viewerDid);
      return c.json(
        {
          enabled,
          items: page.map((item) => toItemBody(item, viewer)),
          nextBefore: last?.indexedAt ?? null,
          nextBeforeId: last?.feedItemId ?? null,
        } satisfies IoriBlueskyTimelineResponse,
      );
    })
    .get('/iori/v1/bluesky/search/posts', authn.requireUser(readSearch), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
        return c.json(forbidden, 403);
      }
      if (blueskySearch === undefined) return c.json({ error: 'Bluesky timeline is disabled' }, 409);
      const input = searchInput(c);
      if (input === undefined) return c.json({ error: 'Validation failed: q' }, 400);
      const searched = await blueskySearch.searchPosts({ ...input, limit: SEARCH_LIMIT });
      if (!searched.ok) return searchFailure(c, searched.err);
      const viewer = await resolveViewerDid(viewerDid);
      return c.json(
        {
          items: searched.val.items.map((item) => toItemBody(item, viewer)),
          cursor: searched.val.cursor ?? null,
        } satisfies IoriBlueskySearchPostsResponse,
      );
    })
    .get('/iori/v1/bluesky/search/actors', authn.requireUser(readSearch), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
        return c.json(forbidden, 403);
      }
      if (blueskySearch === undefined) return c.json({ error: 'Bluesky timeline is disabled' }, 409);
      const input = searchInput(c);
      if (input === undefined) return c.json({ error: 'Validation failed: q' }, 400);
      const searched = await blueskySearch.searchActors({ ...input, limit: SEARCH_LIMIT });
      if (!searched.ok) return searchFailure(c, searched.err);
      return c.json(
        {
          actors: searched.val.actors.map(toActorBody),
          cursor: searched.val.cursor ?? null,
        } satisfies IoriBlueskySearchActorsResponse,
      );
    })
    .get('/iori/v1/bluesky/thread', authn.requireUser(readStatuses), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
        return c.json(forbidden, 403);
      }
      if (blueskyPostThreadFetcher === undefined) {
        return c.json({ error: 'Bluesky timeline is disabled' }, 409);
      }
      const uri = c.req.query('uri');
      if (uri === undefined || !blueskyPostUriPattern.test(uri)) {
        return c.json({ error: 'Validation failed: uri' }, 400);
      }
      const thread = await blueskyPostThreadFetcher.fetch({ uri });
      if (!thread.ok) return threadFailure(c, thread.err);
      const viewer = await resolveViewerDid(viewerDid);
      return c.json(
        {
          ancestors: thread.val.ancestors.map((node) => toNodeBody(node, viewer)),
          post: toItemBody(thread.val.post, viewer),
          replies: thread.val.replies.map(({ depth, node }) => ({ depth, node: toNodeBody(node, viewer) })),
        } satisfies IoriBlueskyThreadResponse,
      );
    })
    .get('/iori/v1/bluesky/status', authn.requireUser(readStatuses), async (c) => {
      const isOwner = await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined);
      if (!blueskyTimelineEnabled || !isOwner) {
        return c.json({ enabled: false } satisfies IoriBlueskyStatusResponse);
      }
      const [records, loginFailedAt] = await Promise.all([
        blueskySyncStatusResolver.resolve(),
        blueskyLoginFailureResolver.resolve(),
      ]);
      if (!records.ok || !loginFailedAt.ok) return c.json(internalServerError, 500);
      const status = toBlueskyConnectionStatus({
        records: records.val,
        loginFailedAt: loginFailedAt.val,
        now: now(),
        loginCooldownMs: BLUESKY_LOGIN_RETRY_COOLDOWN_MS,
      });
      return c.json(
        {
          enabled: true,
          timeline: toScopeBody(status.timeline),
          notifications: toScopeBody(status.notifications),
          login: status.login.state === 'waiting'
            ? {
              state: 'waiting',
              failedAt: new Date(status.login.failedAt).toISOString(),
              retryAt: new Date(status.login.retryAt).toISOString(),
            }
            : { state: 'ok' },
        } satisfies IoriBlueskyStatusResponse,
      );
    })
    .post(
      '/iori/v1/bluesky/likes',
      requireSameOriginForCookie,
      authn.requireUser(writeFavourites),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (likeBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const body = await readRequestBody(c);
        const resolved = postTargetOf(bodyString(body, 'feedItemId'), bodyString(body, 'uri'));
        if ('invalid' in resolved) return c.json({ error: `Validation failed: ${resolved.invalid}` }, 400);
        const liked = await likeBlueskyPostUseCase.run(resolved.target);
        return liked.ok
          ? c.json(liked.val satisfies IoriBlueskyLikeResponse)
          : likeFailure(c, liked.err);
      },
    )
    .delete(
      '/iori/v1/bluesky/likes',
      requireSameOriginForCookie,
      authn.requireUser(writeFavourites),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (unlikeBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const resolved = postTargetOf(c.req.query('feedItemId'), c.req.query('uri'));
        if ('invalid' in resolved) return c.json({ error: `Validation failed: ${resolved.invalid}` }, 400);
        const unliked = await unlikeBlueskyPostUseCase.run(resolved.target);
        return unliked.ok
          ? c.json(unliked.val satisfies IoriBlueskyLikeResponse)
          : likeFailure(c, unliked.err);
      },
    )
    .post(
      '/iori/v1/bluesky/reposts',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (repostBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const body = await readRequestBody(c);
        const resolved = postTargetOf(bodyString(body, 'feedItemId'), bodyString(body, 'uri'));
        if ('invalid' in resolved) return c.json({ error: `Validation failed: ${resolved.invalid}` }, 400);
        const reposted = await repostBlueskyPostUseCase.run(resolved.target);
        return reposted.ok
          ? c.json(reposted.val satisfies IoriBlueskyRepostResponse)
          : repostFailure(c, reposted.err);
      },
    )
    .delete(
      '/iori/v1/bluesky/reposts',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (undoRepostBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const resolved = postTargetOf(c.req.query('feedItemId'), c.req.query('uri'));
        if ('invalid' in resolved) return c.json({ error: `Validation failed: ${resolved.invalid}` }, 400);
        const unreposted = await undoRepostBlueskyPostUseCase.run(resolved.target);
        return unreposted.ok
          ? c.json(unreposted.val satisfies IoriBlueskyRepostResponse)
          : repostFailure(c, unreposted.err);
      },
    )
    .post(
      '/iori/v1/bluesky/replies',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (replyToBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const body = await readRequestBody(c);
        const resolved = postTargetOf(bodyString(body, 'feedItemId'), bodyString(body, 'uri'));
        if ('invalid' in resolved) return c.json({ error: `Validation failed: ${resolved.invalid}` }, 400);
        const text = bodyString(body, 'text');
        if (text === undefined) return c.json({ error: 'Validation failed: text' }, 400);
        const replied = await replyToBlueskyPostUseCase.run({ ...resolved.target, text });
        return replied.ok
          ? c.json(replied.val satisfies IoriBlueskyReplyResponse, 201)
          : replyFailure(c, replied.err);
      },
    )
    .post(
      '/iori/v1/bluesky/quotes',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (quoteBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const body = await readRequestBody(c);
        const uri = bodyString(body, 'uri');
        if (uri === undefined || !blueskyPostUriPattern.test(uri)) {
          return c.json({ error: 'Validation failed: uri' }, 400);
        }
        const text = bodyString(body, 'text');
        if (text === undefined) return c.json({ error: 'Validation failed: text' }, 400);
        const quoted = await quoteBlueskyPostUseCase.run({ uri, text });
        return quoted.ok
          ? c.json(quoted.val satisfies IoriBlueskyQuoteResponse, 201)
          : quoteFailure(c, quoted.err);
      },
    )
    .post(
      '/iori/v1/bluesky/notifications/seen',
      requireSameOriginForCookie,
      authn.requireUser(writeNotifications),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (markBlueskyNotificationsSeenUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const seenAtText = bodyString(await readRequestBody(c), 'seenAt');
        const seenAt = seenAtText !== undefined && isoInstantPattern.test(seenAtText)
          ? Instant.of(Date.parse(seenAtText))
          : undefined;
        if (seenAt === undefined || !seenAt.ok) return c.json({ error: 'Validation failed: seenAt' }, 400);
        const marked = await markBlueskyNotificationsSeenUseCase.run({ seenAt: seenAt.val });
        return marked.ok ? c.body(null, 204) : clientFailure(c, marked.err);
      },
    )
    .use('/iori/v1/bluesky/chat/*', async (c, next) => {
      await next();
      c.res.headers.set('Cache-Control', 'private, no-store');
    })
    .get('/iori/v1/bluesky/chat/convos', authn.requireUser(readStatuses), async (c) => {
      const chat = await chatAccess(c);
      if (chat instanceof Response) return chat;
      const listed = await chat.listConvos.run({ cursor: cursorOf(c) });
      return listed.ok
        ? c.json(listed.val satisfies IoriBlueskyChatConvosResponse)
        : chatFailure(c, listed.err);
    })
    .get('/iori/v1/bluesky/chat/unread_count', authn.requireUser(readStatuses), async (c) => {
      const chat = await chatAccess(c);
      if (chat instanceof Response) return chat;
      const counted = await chat.unreadCount.run();
      return counted.ok
        ? c.json(counted.val satisfies IoriBlueskyChatUnreadCountResponse)
        : chatFailure(c, counted.err);
    })
    .get('/iori/v1/bluesky/chat/convos/:convoId', authn.requireUser(readStatuses), async (c) => {
      const chat = await chatAccess(c);
      if (chat instanceof Response) return chat;
      const found = await chat.getConvo.run({ convoId: c.req.param('convoId') });
      return found.ok
        ? c.json({ convo: found.val } satisfies IoriBlueskyChatConvoResponse)
        : chatFailure(c, found.err);
    })
    .get('/iori/v1/bluesky/chat/convos/:convoId/messages', authn.requireUser(readStatuses), async (c) => {
      const chat = await chatAccess(c);
      if (chat instanceof Response) return chat;
      const listed = await chat.listMessages.run({ convoId: c.req.param('convoId'), cursor: cursorOf(c) });
      return listed.ok
        ? c.json(listed.val satisfies IoriBlueskyChatMessagesResponse)
        : chatFailure(c, listed.err);
    })
    .post(
      '/iori/v1/bluesky/chat/convos/:convoId/messages',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        const chat = await chatAccess(c);
        if (chat instanceof Response) return chat;
        const text = bodyString(await readRequestBody(c), 'text');
        if (text === undefined) return c.json({ error: 'Validation failed: text' }, 400);
        const sent = await chat.sendMessage.run({ convoId: c.req.param('convoId'), text });
        return sent.ok
          ? c.json({ message: sent.val } satisfies IoriBlueskyChatSendMessageResponse, 201)
          : chatFailure(c, sent.err);
      },
    )
    .post(
      '/iori/v1/bluesky/chat/convos/:convoId/read',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        const chat = await chatAccess(c);
        if (chat instanceof Response) return chat;
        const body = await readRequestBody(c);
        if (body.messageId !== undefined && typeof body.messageId !== 'string') {
          return c.json({ error: 'Validation failed: messageId' }, 400);
        }
        const marked = await chat.markRead.run({
          convoId: c.req.param('convoId'),
          messageId: bodyString(body, 'messageId'),
        });
        return marked.ok
          ? c.json({ convo: marked.val } satisfies IoriBlueskyChatReadResponse)
          : chatFailure(c, marked.err);
      },
    )
    .post(
      '/iori/v1/bluesky/chat/convos/:convoId/accept',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        const chat = await chatAccess(c);
        if (chat instanceof Response) return chat;
        const accepted = await chat.acceptConvo.run({ convoId: c.req.param('convoId') });
        return accepted.ok ? c.body(null, 204) : chatFailure(c, accepted.err);
      },
    )
    .post(
      '/iori/v1/bluesky/chat/convos',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        const chat = await chatAccess(c);
        if (chat instanceof Response) return chat;
        const did = bodyString(await readRequestBody(c), 'did');
        if (did === undefined || !didPattern.test(did)) return c.json({ error: 'Validation failed: did' }, 400);
        const opened = await chat.openConvo.run({ did });
        return opened.ok
          ? c.json({ convoId: opened.val.id } satisfies IoriBlueskyChatOpenResponse)
          : chatFailure(c, opened.err);
      },
    );
};
