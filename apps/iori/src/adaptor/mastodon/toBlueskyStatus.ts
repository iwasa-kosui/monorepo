import type { Instant } from '../../domain/instant/instant.ts';
import type {
  BlueskyLikeNotification,
  BlueskyLikeViaRepostNotification,
  BlueskyMentionNotification,
  BlueskyRepostNotification,
  BlueskyRepostViaRepostNotification,
} from '../../domain/notification/notification.ts';
import { plainTextToHtml } from '../../domain/post/plainTextToHtml.ts';
import { BLUESKY_STATUS_ID_PREFIX } from '../../helper/blueskyUrl.ts';
import type { Account, Status } from './entities.ts';
import { toIsoString } from './time.ts';
import { blueskyExtensionOf } from './toNotification.ts';

type BlueskyStatusSource =
  | BlueskyLikeNotification
  | BlueskyRepostNotification
  | BlueskyLikeViaRepostNotification
  | BlueskyRepostViaRepostNotification
  | BlueskyMentionNotification;

const targetUriOf = (notification: BlueskyStatusSource): string =>
  notification.type === 'blueskyMention' ? notification.blueskyUri : notification.subjectUri;

export const toBlueskyStatus = (
  notification: BlueskyStatusSource,
  options: Readonly<{ createdAt: Instant; account: Account }>,
): Status => {
  const url = blueskyExtensionOf(notification).url;
  return {
    id: `${BLUESKY_STATUS_ID_PREFIX}${targetUriOf(notification)}`,
    uri: url,
    created_at: toIsoString(options.createdAt),
    account: options.account,
    content: notification.type === 'blueskyMention' ? plainTextToHtml(notification.text) : '',
    visibility: 'public',
    sensitive: false,
    spoiler_text: '',
    media_attachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    reblogs_count: 0,
    favourites_count: 0,
    replies_count: 0,
    url,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    reblog: null,
    quote: null,
    poll: null,
    card: null,
    language: null,
    edited_at: null,
    favourited: false,
    reblogged: false,
    muted: false,
    bookmarked: false,
    pinned: false,
  };
};
