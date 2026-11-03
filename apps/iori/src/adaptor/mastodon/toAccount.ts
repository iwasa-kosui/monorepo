import type { LocalActor, RemoteActor } from '../../domain/actor/actor.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { User } from '../../domain/user/user.ts';
import type { Account } from './entities.ts';
import { toDateString, toIsoString } from './time.ts';

export type AccountSource =
  | Readonly<{ type: 'local'; user: User; actor: LocalActor }>
  | Readonly<{ type: 'remote'; actor: RemoteActor }>;

export type ToAccountOptions = Readonly<{
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

const toAccountOf = (
  props: Readonly<
    { id: string; username: string; acct: string; uri: string; url: string; logoUri: string | undefined }
  >,
  options: ToAccountOptions,
): Account => {
  const avatar = props.logoUri ?? options.defaultAvatarUrl;
  return {
    id: props.id,
    username: props.username,
    acct: props.acct,
    url: props.url,
    uri: props.uri,
    display_name: props.username,
    note: '',
    avatar,
    avatar_static: avatar,
    header: options.defaultHeaderUrl,
    header_static: options.defaultHeaderUrl,
    locked: false,
    fields: [],
    emojis: [],
    bot: false,
    group: false,
    discoverable: null,
    indexable: false,
    hide_collections: null,
    created_at: toIsoString(options.createdAt),
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
      logoUri: actor.logoUri,
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
    logoUri: actor.logoUri,
  }, options);
};
