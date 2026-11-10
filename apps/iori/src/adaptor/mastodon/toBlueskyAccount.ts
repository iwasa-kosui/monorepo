import type { BlueskyNotificationAuthor } from '../../domain/notification/notification.ts';
import { blueskyProfileUrlOfActor, BSKY_APP_URL } from '../../helper/blueskyUrl.ts';
import type { Account } from './entities.ts';

export const BLUESKY_ACCOUNT_ID_PREFIX = 'bluesky:';

export const blueskyProfileUrlOf = (author: BlueskyNotificationAuthor): string =>
  blueskyProfileUrlOfActor(author.handle)
    ?? blueskyProfileUrlOfActor(author.did)
    ?? `${BSKY_APP_URL}/profile/${encodeURIComponent(author.handle)}`;

export const toBlueskyAccount = (
  author: BlueskyNotificationAuthor,
  options: Readonly<{ defaultAvatarUrl: string; defaultHeaderUrl: string }>,
): Account => {
  const avatar = author.avatarUrl ?? options.defaultAvatarUrl;
  return {
    id: `${BLUESKY_ACCOUNT_ID_PREFIX}${author.did}`,
    username: author.handle,
    acct: author.handle,
    url: blueskyProfileUrlOf(author),
    uri: blueskyProfileUrlOfActor(author.did) ?? blueskyProfileUrlOf(author),
    display_name: author.displayName ?? author.handle,
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
    created_at: '1970-01-01T00:00:00.000Z',
    last_status_at: null,
    statuses_count: 0,
    followers_count: 0,
    following_count: 0,
  };
};
