import type { RequestContext } from '@fedify/fedify';
import { type Context, Hono } from 'hono';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { FediverseConversationKey } from '../../domain/fediverseConversation/conversationKey.ts';
import {
  decodeDirectMessageCursor,
  type DirectMessageActor,
  type DirectMessageActorsResolverByUris,
  type DirectMessageNotificationsReadMarker,
  type DirectMessagePost,
  type DirectMessagePostsResolver,
  encodeDirectMessageCursor,
  FEDIVERSE_CONVERSATION_MESSAGES_LIMIT,
  FEDIVERSE_CONVERSATION_SCAN_LIMIT,
  FEDIVERSE_CONVERSATION_UNREAD_SCAN_LIMIT,
  type FediverseConversationGroup,
  type FediverseConversationViewer,
  groupDirectMessagePosts,
} from '../../domain/fediverseConversation/fediverseConversation.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import { mentionLinksOfHtml, MentionRecipient } from '../../domain/post/mention.ts';
import { plainTextToHtml } from '../../domain/post/plainTextToHtml.ts';
import type { PostsWithAuthorResolverByPostIds } from '../../domain/post/post.ts';
import type { CreatePostUseCase } from '../../useCase/createPost.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { SendReplyUseCase } from '../../useCase/sendReply.ts';
import { defaultImageUrls } from '../mastodon/defaultImages.ts';
import type { Account, Status } from '../mastodon/entities.ts';
import { MAX_STATUS_CHARACTERS } from '../mastodon/instance.ts';
import { type StatusAssembler, StatusAssemblyError, type StatusSource } from '../mastodon/statusAssembler.ts';
import { htmlToPlainText } from '../text/htmlToPlainText.ts';
import { actorNotFound, handleInternalError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriFediverseConversationsRouterDeps = Readonly<{
  authn: MastodonAuthn;
  isDigestOwner: IsDigestOwner;
  actorResolverByUserId: ActorResolverByUserId;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  statusAssembler: StatusAssembler;
  directMessagePostsResolver: DirectMessagePostsResolver;
  directMessageActorsResolverByUris: DirectMessageActorsResolverByUris;
  directMessageNotificationsReadMarker: DirectMessageNotificationsReadMarker;
  createPostUseCase: CreatePostUseCase;
  sendReplyUseCase: SendReplyUseCase;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

export type IoriFediverseConversationPeerBody = Readonly<{
  accountId: string | null;
  actorUri: string;
  acct: string;
  displayName: string;
  avatar: string;
  path: string | null;
}>;

export type IoriFediverseConversationLastMessageBody = Readonly<{
  text: string;
  sentAt: number;
  own: boolean;
}>;

export type IoriFediverseConversationBody = Readonly<{
  key: string;
  peers: readonly IoriFediverseConversationPeerBody[];
  lastMessage: IoriFediverseConversationLastMessageBody | null;
  unreadCount: number;
}>;

export type IoriFediverseConversationsResponse = Readonly<{
  conversations: readonly IoriFediverseConversationBody[];
  cursor: string | null;
}>;

export type IoriFediverseConversationResponse = Readonly<{ conversation: IoriFediverseConversationBody }>;

export type IoriFediverseConversationMessagesResponse = Readonly<{
  messages: readonly Status[];
  cursor: string | null;
  order: 'oldest_first';
}>;

export type IoriFediverseConversationSendMessageRequest = Readonly<{ text: string }>;

export type IoriFediverseConversationSendMessageResponse = Readonly<{ message: Status }>;

export type IoriFediverseConversationOpenRequest = Readonly<{ actorUri: string }>;

export type IoriFediverseConversationOpenResponse = Readonly<{ key: string }>;

export type IoriFediverseConversationUnreadCountResponse = Readonly<{ unread: number }>;

export type IoriFediverseConversationErrorBody =
  | Readonly<{ error: 'Validation failed: text'; reason: 'empty' | 'too_long' }>
  | Readonly<{ error: 'Validation failed: key' | 'Validation failed: cursor' | 'Validation failed: actorUri' }>
  | Readonly<{ error: 'Validation failed: peers' }>
  | Readonly<{ error: 'Record not found' }>
  | Readonly<{ error: 'Forbidden' }>;

const BASE_PATH = '/iori/v1/fediverse/conversations';
const SUMMARY_MAX_CHARS = 120;
const readStatuses = Scope.orThrow('read:statuses');
const writeStatuses = Scope.orThrow('write:statuses');
const forbidden = { error: 'Forbidden' } as const;
const recordNotFound = { error: 'Record not found' } as const;
const invalidKey = { error: 'Validation failed: key' } as const;
const invalidCursor = { error: 'Validation failed: cursor' } as const;
const invalidActorUri = { error: 'Validation failed: actorUri' } as const;
const invalidPeers = { error: 'Validation failed: peers' } as const;
const invalidToken = { error: 'The access token is invalid' } as const;

type Access = Readonly<{ userId: FediverseConversationViewer['userId']; viewer: FediverseConversationViewer }>;

const lastSegmentOf = (uri: string): string => {
  const segments = new URL(uri).pathname.split('/').filter((segment) => segment !== '');
  return segments.at(-1) ?? new URL(uri).host;
};

const peerBodyOf = (
  uri: string,
  actor: DirectMessageActor | undefined,
  account: Account | undefined,
  defaultAvatarUrl: string,
): IoriFediverseConversationPeerBody => {
  if (actor === undefined || account === undefined) {
    const acct = `${lastSegmentOf(uri)}@${new URL(uri).host}`;
    return { accountId: null, actorUri: uri, acct, displayName: acct, avatar: defaultAvatarUrl, path: null };
  }
  return {
    accountId: actor.actorId,
    actorUri: uri,
    acct: account.acct,
    displayName: account.display_name,
    avatar: account.avatar,
    path: actor.type === 'local' ? `/users/${encodeURIComponent(account.username)}` : `/remote-users/${actor.actorId}`,
  };
};

const cursorOf = (c: Context): string | undefined => {
  const cursor = c.req.query('cursor');
  return cursor === undefined || cursor === '' ? undefined : cursor;
};

const failed = (c: Context, err: Readonly<{ type: string }>): Response => {
  switch (err.type) {
    case 'PostNotFoundError':
      return c.json(recordNotFound, 404);
    case 'UserNotFoundError':
    case 'SessionExpiredError':
      return c.json(invalidToken, 401);
    case 'RemoteNoteLookupError':
      return c.json({ error: 'The remote server could not be reached' }, 502);
    default:
      throw new Error(`The conversation action failed: ${err.type}`);
  }
};

export const createWorkerIoriFediverseConversationsRouter = ({
  authn,
  isDigestOwner,
  actorResolverByUserId,
  postsWithAuthorResolverByPostIds,
  statusAssembler,
  directMessagePostsResolver,
  directMessageActorsResolverByUris,
  directMessageNotificationsReadMarker,
  createPostUseCase,
  sendReplyUseCase,
  createContext,
}: WorkerIoriFediverseConversationsRouterDeps): Hono<MastodonAuthEnv> => {
  const access = async (c: Context<MastodonAuthEnv>): Promise<Access | Response> => {
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) return c.json(invalidToken, 401);
    if (!await isDigestOwner(userId)) return c.json(forbidden, 403);
    const actor = await actorResolverByUserId.resolve(userId);
    if (!actor.ok) throw new StatusAssemblyError('Failed to resolve the viewer');
    if (actor.val === undefined) return c.json(actorNotFound, 422);
    return { userId, viewer: { userId, actorId: actor.val.id, actorUri: actor.val.uri } };
  };

  const accessWithKey = async (
    c: Context<MastodonAuthEnv>,
  ): Promise<(Access & Readonly<{ peerUris: ReadonlyArray<string> }>) | Response> => {
    const granted = await access(c);
    if (granted instanceof Response) return granted;
    const decoded = FediverseConversationKey.decode(c.req.param('key') ?? '');
    if (!decoded.ok || decoded.val.includes(granted.viewer.actorUri)) return c.json(invalidKey, 400);
    return { ...granted, peerUris: decoded.val };
  };

  const resolvePosts = async (
    condition: Parameters<DirectMessagePostsResolver['resolve']>[0],
  ): Promise<ReadonlyArray<DirectMessagePost>> => {
    const posts = await directMessagePostsResolver.resolve(condition);
    if (!posts.ok) throw new StatusAssemblyError('Failed to resolve the direct messages');
    return posts.val;
  };

  const resolveActors = async (uris: ReadonlyArray<string>): Promise<ReadonlyMap<string, DirectMessageActor>> => {
    const actors = await directMessageActorsResolverByUris.resolve(uris);
    if (!actors.ok) throw new StatusAssemblyError('Failed to resolve the conversation peers');
    return actors.val;
  };

  const resolveAccounts = async (
    c: Context,
    actors: ReadonlyMap<string, DirectMessageActor>,
  ): Promise<ReadonlyMap<string, Account>> => {
    const accounts = await statusAssembler.assembleAccounts({
      actorIds: [...actors.values()].map((actor) => actor.actorId),
      requestUrl: c.req.url,
    });
    const byId = new Map(accounts.map((account) => [account.id, account]));
    return new Map([...actors].flatMap(([uri, actor]) => {
      const account = byId.get(actor.actorId);
      return account === undefined ? [] : [[uri, account] as const];
    }));
  };

  const peersOf = async (
    c: Context,
    peerUris: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<IoriFediverseConversationPeerBody>> => {
    const actors = await resolveActors(peerUris);
    const accounts = await resolveAccounts(c, actors);
    const { defaultAvatarUrl } = defaultImageUrls(c.req.url);
    return peerUris.map((uri) => peerBodyOf(uri, actors.get(uri), accounts.get(uri), defaultAvatarUrl));
  };

  const conversationBodies = async (
    c: Context,
    groups: ReadonlyArray<FediverseConversationGroup>,
  ): Promise<ReadonlyArray<IoriFediverseConversationBody>> => {
    const actors = await resolveActors([...new Set(groups.flatMap((group) => group.peerUris))]);
    const accounts = await resolveAccounts(c, actors);
    const { defaultAvatarUrl } = defaultImageUrls(c.req.url);
    return groups.map((group) => ({
      key: group.key,
      peers: group.peerUris.map((uri) => peerBodyOf(uri, actors.get(uri), accounts.get(uri), defaultAvatarUrl)),
      lastMessage: {
        text: htmlToPlainText(group.last.content, SUMMARY_MAX_CHARS),
        sentAt: group.last.createdAt,
        own: group.last.own,
      },
      unreadCount: group.unreadCount,
    }));
  };

  const assembleStatuses = async (
    c: Context,
    viewer: FediverseConversationViewer,
    posts: ReadonlyArray<DirectMessagePost>,
  ): Promise<readonly Status[]> => {
    if (posts.length === 0) return [];
    const resolved = await postsWithAuthorResolverByPostIds.resolve({
      postIds: posts.map((post) => post.postId),
      currentActorId: viewer.actorId,
      onlyVisibleToViewer: true,
    });
    if (!resolved.ok) throw new StatusAssemblyError('Failed to resolve the direct messages');
    const sources = posts.flatMap((post): StatusSource[] => {
      const found = resolved.val.get(post.postId);
      return found === undefined ? [] : [{ type: 'post', post: found }];
    });
    return await statusAssembler.assemble({ sources, viewerActorId: viewer.actorId, requestUrl: c.req.url });
  };

  const cacheControl = async (c: Context, next: () => Promise<void>) => {
    await next();
    c.res.headers.set('Cache-Control', 'private, no-store');
  };

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .use(BASE_PATH, cacheControl)
    .use(`${BASE_PATH}/*`, cacheControl)
    .get(BASE_PATH, authn.requireUser(readStatuses), async (c) => {
      const granted = await access(c);
      if (granted instanceof Response) return granted;
      const raw = cursorOf(c);
      const before = raw === undefined ? undefined : decodeDirectMessageCursor(raw);
      if (raw !== undefined && before === undefined) return c.json(invalidCursor, 400);
      const posts = await resolvePosts({
        viewer: granted.viewer,
        before,
        limit: FEDIVERSE_CONVERSATION_SCAN_LIMIT,
      });
      const oldest = posts.at(-1);
      return c.json(
        {
          conversations: await conversationBodies(c, groupDirectMessagePosts(posts, granted.viewer.actorUri)),
          cursor: posts.length >= FEDIVERSE_CONVERSATION_SCAN_LIMIT && oldest !== undefined
            ? encodeDirectMessageCursor(oldest)
            : null,
        } satisfies IoriFediverseConversationsResponse,
      );
    })
    .get(`${BASE_PATH}/unread_count`, authn.requireUser(readStatuses), async (c) => {
      const granted = await access(c);
      if (granted instanceof Response) return granted;
      const posts = await resolvePosts({
        viewer: granted.viewer,
        unreadOnly: true,
        limit: FEDIVERSE_CONVERSATION_UNREAD_SCAN_LIMIT,
      });
      return c.json(
        {
          unread: groupDirectMessagePosts(posts, granted.viewer.actorUri).length,
        } satisfies IoriFediverseConversationUnreadCountResponse,
      );
    })
    .get(`${BASE_PATH}/:key`, authn.requireUser(readStatuses), async (c) => {
      const granted = await accessWithKey(c);
      if (granted instanceof Response) return granted;
      const [latest, unread, peers] = await Promise.all([
        resolvePosts({ viewer: granted.viewer, participantUris: granted.peerUris, limit: 1 }),
        resolvePosts({
          viewer: granted.viewer,
          participantUris: granted.peerUris,
          unreadOnly: true,
          limit: FEDIVERSE_CONVERSATION_UNREAD_SCAN_LIMIT,
        }),
        peersOf(c, granted.peerUris),
      ]);
      const last = latest[0];
      return c.json(
        {
          conversation: {
            key: c.req.param('key'),
            peers,
            lastMessage: last === undefined ? null : {
              text: htmlToPlainText(last.content, SUMMARY_MAX_CHARS),
              sentAt: last.createdAt,
              own: last.authorUri === granted.viewer.actorUri,
            },
            unreadCount: unread.length,
          },
        } satisfies IoriFediverseConversationResponse,
      );
    })
    .get(`${BASE_PATH}/:key/messages`, authn.requireUser(readStatuses), async (c) => {
      const granted = await accessWithKey(c);
      if (granted instanceof Response) return granted;
      const raw = cursorOf(c);
      const before = raw === undefined ? undefined : decodeDirectMessageCursor(raw);
      if (raw !== undefined && before === undefined) return c.json(invalidCursor, 400);
      const posts = await resolvePosts({
        viewer: granted.viewer,
        participantUris: granted.peerUris,
        before,
        limit: FEDIVERSE_CONVERSATION_MESSAGES_LIMIT + 1,
      });
      const page = posts.slice(0, FEDIVERSE_CONVERSATION_MESSAGES_LIMIT);
      const oldest = page.at(-1);
      return c.json(
        {
          messages: await assembleStatuses(c, granted.viewer, [...page].reverse()),
          cursor: posts.length > page.length && oldest !== undefined ? encodeDirectMessageCursor(oldest) : null,
          order: 'oldest_first',
        } satisfies IoriFediverseConversationMessagesResponse,
      );
    })
    .post(
      `${BASE_PATH}/:key/messages`,
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        const granted = await accessWithKey(c);
        if (granted instanceof Response) return granted;
        const text = bodyString(await readRequestBody(c), 'text')?.trim() ?? '';
        if (text === '') {
          return c.json(
            { error: 'Validation failed: text', reason: 'empty' } satisfies IoriFediverseConversationErrorBody,
            422,
          );
        }
        if ([...text].length > MAX_STATUS_CHARACTERS) {
          return c.json(
            { error: 'Validation failed: text', reason: 'too_long' } satisfies IoriFediverseConversationErrorBody,
            422,
          );
        }
        const actors = await resolveActors(granted.peerUris);
        const accounts = await resolveAccounts(c, actors);
        const peers = granted.peerUris.map((uri) => ({ uri, actor: actors.get(uri), account: accounts.get(uri) }));
        const mentionable = peers.flatMap(({ uri, actor, account }) => {
          const recipient = actor === undefined || actor.type !== 'remote'
            ? undefined
            : MentionRecipient.parse({ id: uri, inboxUrl: actor.inboxUrl });
          return account === undefined || !account.acct.includes('@') || recipient === undefined || !recipient.ok
            ? []
            : [{ uri, acct: account.acct, recipient: recipient.val }];
        });
        if (mentionable.length !== peers.length) return c.json(invalidPeers, 422);
        const content = plainTextToHtml(
          `${mentionable.map(({ acct }) => `@${acct}`).join(' ')} ${text}`,
          new Map(mentionable.map(({ acct, uri }) => [acct, uri])),
        );
        const linked = new Set(mentionLinksOfHtml(content).map((link) => link.href));
        if (!granted.peerUris.every((uri) => linked.has(uri))) return c.json(invalidPeers, 422);
        const [latest] = await resolvePosts({ viewer: granted.viewer, participantUris: granted.peerUris, limit: 1 });
        const input = {
          visibility: 'direct' as const,
          userId: granted.userId,
          content,
          mentions: mentionable.map(({ recipient }) => recipient),
          summary: null,
          sensitive: false,
          images: [],
          crosspostToBluesky: false,
          ctx: createContext(c.req.raw),
        };
        const created = latest === undefined
          ? await createPostUseCase.run(input)
          : await sendReplyUseCase.run({ ...input, postId: latest.postId, request: c.req.raw });
        if (!created.ok) return failed(c, created.err);
        const resolved = await postsWithAuthorResolverByPostIds.resolve({
          postIds: [created.val.post.postId],
          currentActorId: granted.viewer.actorId,
          onlyVisibleToViewer: true,
        });
        const post = resolved.ok ? resolved.val.get(created.val.post.postId) : undefined;
        const [status] = post === undefined
          ? []
          : await statusAssembler.assemble({
            sources: [{ type: 'post', post }],
            viewerActorId: granted.viewer.actorId,
            requestUrl: c.req.url,
          });
        if (status === undefined) throw new StatusAssemblyError('Failed to resolve the created message');
        return c.json({ message: status } satisfies IoriFediverseConversationSendMessageResponse, 201);
      },
    )
    .post(`${BASE_PATH}/:key/read`, requireSameOriginForCookie, authn.requireUser(writeStatuses), async (c) => {
      const granted = await accessWithKey(c);
      if (granted instanceof Response) return granted;
      const unread = await resolvePosts({
        viewer: granted.viewer,
        participantUris: granted.peerUris,
        unreadOnly: true,
        limit: FEDIVERSE_CONVERSATION_UNREAD_SCAN_LIMIT,
      });
      await directMessageNotificationsReadMarker.markRead({
        userId: granted.userId,
        postIds: unread.map((post) => post.postId),
      });
      return c.body(null, 204);
    })
    .post(BASE_PATH, requireSameOriginForCookie, authn.requireUser(writeStatuses), async (c) => {
      const granted = await access(c);
      if (granted instanceof Response) return granted;
      const actorUri = bodyString(await readRequestBody(c), 'actorUri');
      const key = actorUri === undefined ? undefined : FediverseConversationKey.encode([actorUri]);
      if (actorUri === undefined || key === undefined || !key.ok) return c.json(invalidActorUri, 400);
      if (actorUri === granted.viewer.actorUri) return c.json(invalidActorUri, 422);
      const actors = await resolveActors([actorUri]);
      if (!actors.has(actorUri)) return c.json(recordNotFound, 404);
      return c.json({ key: key.val } satisfies IoriFediverseConversationOpenResponse);
    });
};
