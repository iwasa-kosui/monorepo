import type { LocalActor, RemoteActor } from '../../domain/actor/actor.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import { plainTextToHtml } from '../../domain/post/plainTextToHtml.ts';
import type { User } from '../../domain/user/user.ts';
import type { Account, CustomEmoji, Field } from './entities.ts';
import { toSafeApiUrl } from './safeApiUrl.ts';
import { sanitizeStatusContent } from './sanitizeContent.ts';
import { toDateString, toIsoString } from './time.ts';

export type AccountSource =
  | Readonly<{ type: 'local'; user: User; actor: LocalActor }>
  | Readonly<{ type: 'remote'; actor: RemoteActor }>;

export type ToAccountOptions = Readonly<{
  baseUrl: string;
  defaultAvatarUrl: string;
  defaultHeaderUrl: string;
  followersCount: number;
  followingCount: number;
  statusesCount: number;
  createdAt: Instant;
  lastStatusAt: Instant | null;
}>;

const parseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

const lastPathSegment = (url: URL | undefined): string | undefined => {
  const segments = url?.pathname.split('/').filter((segment) => segment.length > 0) ?? [];
  return segments[segments.length - 1];
};

const resolveRemoteIdentity = (actor: RemoteActor): Readonly<{ username: string; acct: string }> => {
  const uri = parseUrl(actor.uri);
  const host = parseUrl(actor.url ?? actor.uri)?.host ?? uri?.host ?? '';
  const username = actor.username ?? lastPathSegment(uri) ?? host;
  return { username, acct: host.length > 0 ? `${username}@${host}` : username };
};

type RemoteProfile = Readonly<{
  displayName: string | undefined;
  note: string;
  headerUrl: string | undefined;
  locked: boolean;
  bot: boolean;
  group: boolean;
  fields: Field[];
  emojis: CustomEmoji[];
  createdAt: Instant | undefined;
}>;

const toRemoteProfile = (actor: RemoteActor, baseUrl: string): RemoteProfile => ({
  displayName: actor.displayName,
  note: actor.summary === undefined ? '' : sanitizeStatusContent(actor.summary),
  headerUrl: toSafeApiUrl(actor.headerUri, baseUrl),
  locked: actor.manuallyApprovesFollowers ?? false,
  bot: actor.actorType === 'Service' || actor.actorType === 'Application',
  group: actor.actorType === 'Group',
  fields: (actor.fields ?? []).map(({ name, value }) => ({
    name,
    value: sanitizeStatusContent(value),
    verified_at: null,
  })),
  emojis: (actor.emojis ?? []).flatMap(({ shortcode, url }): CustomEmoji[] => {
    const safeUrl = toSafeApiUrl(url, baseUrl);
    return safeUrl === undefined
      ? []
      : [{ shortcode, url: safeUrl, static_url: safeUrl, visible_in_picker: false, category: null }];
  }),
  createdAt: actor.publishedAt as Instant | undefined,
});

const toAccountOf = (
  props: Readonly<
    {
      id: string;
      username: string;
      acct: string;
      uri: string;
      url: string;
      fallbackPath: string;
      logoUri: string | undefined;
      displayName?: string;
      note?: string;
      profile?: RemoteProfile;
    }
  >,
  options: ToAccountOptions,
): Account => {
  const avatar = toSafeApiUrl(props.logoUri, options.baseUrl) ?? options.defaultAvatarUrl;
  const { profile } = props;
  const header = profile?.headerUrl ?? options.defaultHeaderUrl;
  const createdAt = profile?.createdAt ?? options.createdAt;
  const fallbackUrl = new URL(props.fallbackPath, options.baseUrl).href;
  const uri = toSafeApiUrl(props.uri, options.baseUrl) ?? fallbackUrl;
  return {
    id: props.id,
    username: props.username,
    acct: props.acct,
    url: toSafeApiUrl(props.url, options.baseUrl) ?? uri,
    uri,
    display_name: profile?.displayName ?? props.displayName ?? props.username,
    note: profile?.note ?? props.note ?? '',
    avatar,
    avatar_static: avatar,
    header,
    header_static: header,
    locked: profile?.locked ?? false,
    fields: profile?.fields ?? [],
    emojis: profile?.emojis ?? [],
    bot: profile?.bot ?? false,
    group: profile?.group ?? false,
    discoverable: null,
    indexable: false,
    hide_collections: null,
    created_at: toIsoString(createdAt),
    last_status_at: options.lastStatusAt === null ? null : toDateString(options.lastStatusAt),
    statuses_count: options.statusesCount,
    followers_count: options.followersCount,
    following_count: options.followingCount,
  };
};

export const toAccount = (source: AccountSource, options: ToAccountOptions): Account => {
  if (source.type === 'local') {
    const { user, actor } = source;
    return toAccountOf({
      id: actor.id,
      username: user.username,
      acct: user.username,
      uri: actor.uri,
      url: actor.uri,
      fallbackPath: `/users/${user.username}`,
      logoUri: actor.logoUri,
      displayName: actor.displayName,
      note: actor.bio === undefined ? undefined : plainTextToHtml(actor.bio),
    }, options);
  }
  const { actor } = source;
  const { username, acct } = resolveRemoteIdentity(actor);
  return toAccountOf({
    id: actor.id,
    username,
    acct,
    uri: actor.uri,
    url: actor.url ?? actor.uri,
    fallbackPath: `/remote-users/${actor.id}`,
    logoUri: actor.logoUri,
    profile: toRemoteProfile(actor, options.baseUrl),
  }, options);
};
