import { getLogger } from '@logtape/logtape';
import z from 'zod/v4';

import { toAcceptableEmojiImageUrl } from '../../domain/emojiReact/emojiImageUrl.ts';
import { blockedReason } from '../../domain/feedSource/feedSourceUrl.ts';
import {
  type Interactor,
  PostInteractions,
  type ReactionGroup,
  type RemotePostInteractionsFetcher,
} from '../../domain/postInteraction/postInteractions.ts';

const MASTODON_LIMIT = 80;
const MISSKEY_LIMIT = 100;
const MAX_RESPONSE_LENGTH = 2_000_000;
const MAX_TEXT_LENGTH = 200;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const USER_AGENT = 'iori (+https://github.com/iwasa-kosui/monorepo)';

export type RemotePostApi =
  | Readonly<{ type: 'mastodon'; origin: string; statusId: string; hasPleromaReactions: boolean }>
  | Readonly<{ type: 'misskey'; origin: string; noteId: string }>;

const parseUrl = (value: string | null): URL | undefined => {
  if (value === null) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const matchId = (url: URL | undefined, pattern: RegExp): string | undefined => {
  const id = url?.pathname.match(pattern)?.[1];
  return id !== undefined && ID_PATTERN.test(id) ? id : undefined;
};

export const remotePostApiOf = (post: Readonly<{ uri: string; url: string | null }>): RemotePostApi | undefined => {
  const uri = parseUrl(post.uri);
  if (uri === undefined || blockedReason(uri) !== undefined) return undefined;
  const origin = uri.origin;
  const url = parseUrl(post.url);
  const sameHostUrl = url?.host === uri.host ? url : undefined;

  const noteId = matchId(uri, /^\/notes\/([^/]+)$/);
  if (noteId !== undefined) return { type: 'misskey', origin, noteId };

  const pleromaId = matchId(sameHostUrl, /^\/notice\/([^/]+)$/);
  if (pleromaId !== undefined) return { type: 'mastodon', origin, statusId: pleromaId, hasPleromaReactions: true };

  const statusId = matchId(uri, /\/statuses\/([^/]+)$/) ?? matchId(sameHostUrl, /^\/@[^/]+\/([^/]+)$/);
  return statusId === undefined ? undefined : { type: 'mastodon', origin, statusId, hasPleromaReactions: false };
};

const text = z.string().transform((value) => value.slice(0, MAX_TEXT_LENGTH));
const optionalText = z.string().nullish().catch(undefined);

const mastodonAccountSchema = z.object({
  username: text,
  acct: text,
  display_name: optionalText,
  avatar: optionalText,
  url: optionalText,
});

const pleromaReactionSchema = z.object({
  name: text,
  url: optionalText,
  accounts: z.array(z.unknown()).catch([]),
});

const misskeyUserSchema = z.object({
  username: text,
  host: optionalText,
  name: optionalText,
  avatarUrl: optionalText,
});

const misskeyReactionSchema = z.object({ type: text, user: misskeyUserSchema });
const misskeyRenoteSchema = z.object({ text: optionalText, user: misskeyUserSchema });

const httpsUrl = (value: string | null | undefined): string | null => toAcceptableEmojiImageUrl(value);

const displayNameOf = (name: string | null | undefined, fallback: string): string => {
  const trimmed = name?.trim().slice(0, MAX_TEXT_LENGTH) ?? '';
  return trimmed === '' ? fallback : trimmed;
};

const parseEach = <T>(value: unknown, schema: z.ZodType<T>): readonly T[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    })
    : [];

export const parseMastodonAccounts = (value: unknown, host: string): readonly Interactor[] =>
  parseEach(value, mastodonAccountSchema).map((account) => ({
    actorId: null,
    isLocal: false,
    name: displayNameOf(account.display_name, account.username),
    acct: account.acct.includes('@') ? account.acct : `${account.acct}@${host}`,
    avatarUrl: httpsUrl(account.avatar),
    url: httpsUrl(account.url),
  }));

export const parsePleromaReactions = (value: unknown, host: string): readonly ReactionGroup[] =>
  parseEach(value, pleromaReactionSchema).map((reaction) => {
    const emojiImageUrl = httpsUrl(reaction.url);
    return {
      emoji: emojiImageUrl === null ? reaction.name : `:${reaction.name.split('@')[0]}:`,
      emojiImageUrl,
      actors: parseMastodonAccounts(reaction.accounts, host),
    };
  });

const misskeyInteractor = (user: z.infer<typeof misskeyUserSchema>, origin: string): Interactor => {
  const host = user.host ?? new URL(origin).host;
  return {
    actorId: null,
    isLocal: false,
    name: displayNameOf(user.name, user.username),
    acct: `${user.username}@${host}`,
    avatarUrl: httpsUrl(user.avatarUrl),
    url: user.host == null ? `${origin}/@${encodeURIComponent(user.username)}` : null,
  };
};

const CUSTOM_REACTION = /^:([A-Za-z0-9_+-]+)(?:@([A-Za-z0-9.-]+))?:$/;

const misskeyEmoji = (type: string, origin: string): Pick<ReactionGroup, 'emoji' | 'emojiImageUrl'> => {
  const custom = type.match(CUSTOM_REACTION);
  if (custom === null) return { emoji: type, emojiImageUrl: null };
  const [, name, host] = custom;
  const file = host === undefined || host === '.' ? name : `${name}@${host}`;
  return { emoji: `:${name}:`, emojiImageUrl: `${origin}/emoji/${file}.webp` };
};

export const parseMisskeyReactions = (value: unknown, origin: string): readonly ReactionGroup[] => {
  const groups = new Map<string, { emojiImageUrl: string | null; actors: Interactor[] }>();
  for (const reaction of parseEach(value, misskeyReactionSchema)) {
    const { emoji, emojiImageUrl } = misskeyEmoji(reaction.type, origin);
    const group = groups.get(emoji) ?? { emojiImageUrl, actors: [] };
    group.actors.push(misskeyInteractor(reaction.user, origin));
    groups.set(emoji, group);
  }
  return [...groups].map(([emoji, group]) => ({ emoji, ...group }));
};

export const parseMisskeyRenotes = (value: unknown, origin: string): readonly Interactor[] =>
  parseEach(value, misskeyRenoteSchema)
    .filter((renote) => renote.text == null)
    .map((renote) => misskeyInteractor(renote.user, origin));

type Deps = Readonly<{
  fetch?: typeof fetch;
  fetchTimeoutMs?: number;
}>;

export const createRemotePostInteractionsFetcher = (deps: Deps = {}): RemotePostInteractionsFetcher => {
  const fetchImpl: typeof fetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const fetchTimeoutMs = deps.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  const requestJson = async (url: string, signal: AbortSignal, body?: unknown): Promise<unknown> => {
    try {
      const response = await fetchImpl(url, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'manual',
        signal: AbortSignal.any([signal, AbortSignal.timeout(fetchTimeoutMs)]),
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return undefined;
      }
      const raw = await response.text();
      return raw.length > MAX_RESPONSE_LENGTH ? undefined : JSON.parse(raw);
    } catch (error) {
      getLogger().debug(`Failed to read the interactions of a remote post: ${url} - ${error}`);
      return undefined;
    }
  };

  const fetchMastodon = async (
    api: Extract<RemotePostApi, { type: 'mastodon' }>,
    signal: AbortSignal,
  ): Promise<PostInteractions> => {
    const host = new URL(api.origin).host;
    const base = `${api.origin}/api/v1/statuses/${api.statusId}`;
    const [likes, reposts, reactions] = await Promise.all([
      requestJson(`${base}/favourited_by?limit=${MASTODON_LIMIT}`, signal),
      requestJson(`${base}/reblogged_by?limit=${MASTODON_LIMIT}`, signal),
      api.hasPleromaReactions
        ? requestJson(`${api.origin}/api/v1/pleroma/statuses/${api.statusId}/reactions`, signal)
        : undefined,
    ]);
    return {
      likes: parseMastodonAccounts(likes, host),
      reposts: parseMastodonAccounts(reposts, host),
      reactions: parsePleromaReactions(reactions, host),
    };
  };

  const fetchMisskey = async (
    api: Extract<RemotePostApi, { type: 'misskey' }>,
    signal: AbortSignal,
  ): Promise<PostInteractions> => {
    const body = { noteId: api.noteId, limit: MISSKEY_LIMIT };
    const [reactions, renotes] = await Promise.all([
      requestJson(`${api.origin}/api/notes/reactions`, signal, body),
      requestJson(`${api.origin}/api/notes/renotes`, signal, body),
    ]);
    return {
      likes: [],
      reposts: parseMisskeyRenotes(renotes, api.origin),
      reactions: parseMisskeyReactions(reactions, api.origin),
    };
  };

  return {
    fetch: async (post, signal) => {
      const api = remotePostApiOf(post);
      if (api === undefined) return PostInteractions.empty;
      return api.type === 'mastodon' ? fetchMastodon(api, signal) : fetchMisskey(api, signal);
    },
  };
};
