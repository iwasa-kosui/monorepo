import { IORI_EMOJI_REACTION_TYPE, type Notification, type Status } from '../../adaptor/mastodon/entities.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { BLUESKY_STATUS_ID_PREFIX } from '../../helper/blueskyUrl.ts';
import { safeUrl } from '../../helper/safeUrl.ts';
import { accountHandle, accountHref } from '../api/status.ts';

type Props = Readonly<{
  notification: Notification;
  recipientUsername: string;
}>;

const ioriStatusOf = (notification: Notification): Status | undefined =>
  notification.status?.id.startsWith(BLUESKY_STATUS_ID_PREFIX) ? undefined : notification.status;

const createdAtOf = (notification: Notification): Instant => Date.parse(notification.created_at) as Instant;

const PostQuote = ({
  status,
  postUrl,
  createdAt,
  text,
}: {
  status: Status | undefined;
  postUrl: string;
  createdAt: Instant;
  text?: string;
}) => (
  <>
    {text !== undefined && text !== '' && (
      <div class='block p-3 bg-sand-light/50 dark:bg-gray-700/50 rounded-xl shadow-clay-inset'>
        <div class='text-sm text-charcoal dark:text-gray-200 line-clamp-2 whitespace-pre-wrap'>{text}</div>
      </div>
    )}
    {status !== undefined && (text === undefined || text === '') && (
      <div
        role='button'
        class='block p-3 bg-sand-light/50 dark:bg-gray-700/50 rounded-xl hover:bg-sand-light dark:hover:bg-gray-700 transition-colors shadow-clay-inset'
      >
        {status.spoiler_text !== ''
          ? (
            <div class='text-sm text-charcoal dark:text-gray-200 line-clamp-2'>
              CW: {status.spoiler_text}
            </div>
          )
          : (
            <div
              class='text-sm text-charcoal dark:text-gray-200 line-clamp-2 prose dark:prose-invert prose-sm max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light [&_p]:text-charcoal dark:[&_p]:text-gray-200 [&_p]:m-0'
              dangerouslySetInnerHTML={{ __html: status.content }}
            />
          )}
      </div>
    )}
    <a href={postUrl} title={new Date(createdAt).toLocaleString()}>
      <time
        dateTime={new Date(createdAt).toISOString()}
        class='block mt-2 text-xs text-charcoal-light dark:text-gray-500 cursor-pointer hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
      >
        {Instant.formatRelative(createdAt)}
      </time>
    </a>
  </>
);

const LikeNotificationItem = ({ notification, recipientUsername }: Props) => {
  const { account } = notification;
  const status = ioriStatusOf(notification);
  const createdAt = createdAtOf(notification);

  const handle = accountHandle(account);
  const actorUrl = accountHref(account);
  const postUrl = notification.iori?.bluesky?.url ?? `/users/${recipientUsername}/posts/${status?.id ?? ''}`;
  const logoUrl = safeUrl(account.avatar);

  return (
    <article class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover transition-all clay-hover-lift'>
      <div class='flex items-start gap-3'>
        <div class='flex-shrink-0 w-8 h-8 rounded-xl bg-terracotta-light/30 dark:bg-terracotta-dark/30 flex items-center justify-center shadow-clay-sm'>
          <svg
            class='w-4 h-4 text-terracotta dark:text-terracotta-light'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path
              fill-rule='evenodd'
              d='M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z'
              clip-rule='evenodd'
            />
          </svg>
        </div>

        <div class='flex-1 min-w-0'>
          <div class='flex items-center gap-2 mb-2'>
            <a
              href={actorUrl}
              class='flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1'
            >
              <div class='w-6 h-6 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-clay-sm'>
                {logoUrl
                  ? (
                    <img
                      src={logoUrl}
                      alt='Actor Logo'
                      class='w-6 h-6 rounded-full object-cover'
                    />
                  )
                  : (
                    handle.charAt(0).toUpperCase()
                  )}
              </div>
              <span class='text-sm font-medium text-charcoal dark:text-white truncate'>
                {handle}
              </span>
            </a>
            <span class='text-sm text-charcoal-light dark:text-gray-400 flex-shrink-0'>
              liked your post
            </span>
          </div>

          <PostQuote status={status} postUrl={postUrl} createdAt={createdAt} />
        </div>
      </div>
    </article>
  );
};

const ReblogNotificationItem = ({ notification, recipientUsername }: Props) => {
  const { account } = notification;
  const status = ioriStatusOf(notification);
  const createdAt = createdAtOf(notification);

  const handle = accountHandle(account);
  const actorUrl = accountHref(account);
  const postUrl = notification.iori?.bluesky?.url ?? `/users/${recipientUsername}/posts/${status?.id ?? ''}`;
  const logoUrl = safeUrl(account.avatar);

  return (
    <article class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover transition-all clay-hover-lift'>
      <div class='flex items-start gap-3'>
        <div class='flex-shrink-0 w-8 h-8 rounded-xl bg-terracotta-light/30 dark:bg-terracotta-dark/30 flex items-center justify-center shadow-clay-sm'>
          <svg
            class='w-4 h-4 text-terracotta dark:text-terracotta-light'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path
              fill-rule='evenodd'
              d='M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z'
              clip-rule='evenodd'
            />
          </svg>
        </div>

        <div class='flex-1 min-w-0'>
          <div class='flex items-center gap-2 mb-2'>
            <a
              href={actorUrl}
              class='flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1'
            >
              <div class='w-6 h-6 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-clay-sm'>
                {logoUrl
                  ? (
                    <img
                      src={logoUrl}
                      alt='Actor Logo'
                      class='w-6 h-6 rounded-full object-cover'
                    />
                  )
                  : (
                    handle.charAt(0).toUpperCase()
                  )}
              </div>
              <span class='text-sm font-medium text-charcoal dark:text-white truncate'>
                {handle}
              </span>
            </a>
            <span class='text-sm text-charcoal-light dark:text-gray-400 flex-shrink-0'>
              boosted your post
            </span>
          </div>

          <PostQuote status={status} postUrl={postUrl} createdAt={createdAt} />
        </div>
      </div>
    </article>
  );
};

const FollowNotificationItem = ({ notification }: Pick<Props, 'notification'>) => {
  const { account } = notification;
  const createdAt = createdAtOf(notification);

  const handle = accountHandle(account);
  const actorUrl = accountHref(account);
  const logoUrl = safeUrl(account.avatar);

  return (
    <article class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover transition-all clay-hover-lift'>
      <div class='flex items-start gap-3'>
        <div class='flex-shrink-0 w-8 h-8 rounded-xl bg-sage/30 dark:bg-sage-dark/30 flex items-center justify-center shadow-clay-sm'>
          <svg
            class='w-4 h-4 text-sage-dark dark:text-sage'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path d='M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z' />
          </svg>
        </div>

        <div class='flex-1 min-w-0'>
          <div class='flex items-center gap-2'>
            <a
              href={actorUrl}
              class='flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1'
            >
              <div class='w-6 h-6 blob-avatar bg-sage-dark dark:bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-clay-sm'>
                {logoUrl
                  ? (
                    <img
                      src={logoUrl}
                      alt='Actor Logo'
                      class='w-6 h-6 rounded-full object-cover'
                    />
                  )
                  : (
                    handle.charAt(0).toUpperCase()
                  )}
              </div>
              <span class='text-sm font-medium text-charcoal dark:text-white truncate'>
                {handle}
              </span>
            </a>
            <span class='text-sm text-charcoal-light dark:text-gray-400 flex-shrink-0'>
              started following you
            </span>
          </div>

          <time
            dateTime={new Date(createdAt).toISOString()}
            class='block mt-2 text-xs text-charcoal-light dark:text-gray-500 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
            title={new Date(createdAt).toLocaleString()}
          >
            {Instant.formatRelative(createdAt)}
          </time>
        </div>
      </div>
    </article>
  );
};

const EmojiReactNotificationItem = ({ notification, recipientUsername }: Props) => {
  const { account, status, iori } = notification;
  const createdAt = createdAtOf(notification);
  const emoji = iori?.emoji ?? '';

  const handle = accountHandle(account);
  const actorUrl = accountHref(account);
  const postUrl = `/users/${recipientUsername}/posts/${status?.id ?? ''}`;

  const safeEmojiImageUrl = safeUrl(iori?.url);
  const emojiDisplay = safeEmojiImageUrl
    ? <img src={safeEmojiImageUrl} alt={emoji} class='w-6 h-6 object-contain' />
    : <span class='text-lg'>{emoji}</span>;

  const logoUrl = safeUrl(account.avatar);

  return (
    <article class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover transition-all clay-hover-lift'>
      <div class='flex items-start gap-3'>
        <div class='flex-shrink-0 w-8 h-8 rounded-xl bg-sand-light dark:bg-sand/30 flex items-center justify-center shadow-clay-sm'>
          {emojiDisplay}
        </div>

        <div class='flex-1 min-w-0'>
          <div class='flex items-center gap-2 mb-2'>
            <a
              href={actorUrl}
              class='flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1'
            >
              <div class='w-6 h-6 blob-avatar bg-sand dark:bg-gray-600 flex items-center justify-center text-charcoal text-xs font-semibold flex-shrink-0 shadow-clay-sm'>
                {logoUrl
                  ? (
                    <img
                      src={logoUrl}
                      alt='Actor Logo'
                      class='w-6 h-6 rounded-full object-cover'
                    />
                  )
                  : (
                    handle.charAt(0).toUpperCase()
                  )}
              </div>
              <span class='text-sm font-medium text-charcoal dark:text-white truncate'>
                {handle}
              </span>
            </a>
            <span class='text-sm text-charcoal-light dark:text-gray-400 flex items-center gap-1 flex-shrink-0'>
              reacted with {emojiDisplay}
            </span>
          </div>

          <PostQuote status={status} postUrl={postUrl} createdAt={createdAt} />
        </div>
      </div>
    </article>
  );
};

const mentionLabelOf = (notification: Notification): string => {
  switch (notification.iori?.bluesky?.reason) {
    case 'mention':
      return 'mentioned you';
    case 'quote':
      return 'quoted your post';
    default:
      return 'replied to your post';
  }
};

const MentionNotificationItem = ({ notification, recipientUsername }: Props) => {
  const { account } = notification;
  const status = ioriStatusOf(notification);
  const createdAt = createdAtOf(notification);

  const handle = accountHandle(account);
  const actorUrl = accountHref(account);
  // 旧 UI と同じく、返信そのものではなく返信先の投稿へリンクする
  const postUrl = notification.iori?.bluesky?.url
    ?? `/users/${recipientUsername}/posts/${status?.in_reply_to_id ?? status?.id ?? ''}`;
  const logoUrl = safeUrl(account.avatar);

  return (
    <article class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover transition-all clay-hover-lift'>
      <div class='flex items-start gap-3'>
        <div class='flex-shrink-0 w-8 h-8 rounded-xl bg-sage/30 dark:bg-sage-dark/30 flex items-center justify-center shadow-clay-sm'>
          <svg
            class='w-4 h-4 text-sage-dark dark:text-sage'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path
              fill-rule='evenodd'
              d='M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z'
              clip-rule='evenodd'
            />
          </svg>
        </div>

        <div class='flex-1 min-w-0'>
          <div class='flex items-center gap-2 mb-2'>
            <a
              href={actorUrl}
              class='flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1'
            >
              <div class='w-6 h-6 blob-avatar bg-sage-dark dark:bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-clay-sm'>
                {logoUrl
                  ? (
                    <img
                      src={logoUrl}
                      alt='Actor Logo'
                      class='w-6 h-6 rounded-full object-cover'
                    />
                  )
                  : (
                    handle.charAt(0).toUpperCase()
                  )}
              </div>
              <span class='text-sm font-medium text-charcoal dark:text-white truncate'>
                {handle}
              </span>
            </a>
            <span class='text-sm text-charcoal-light dark:text-gray-400 flex-shrink-0'>
              {mentionLabelOf(notification)}
            </span>
          </div>

          <PostQuote status={status} postUrl={postUrl} createdAt={createdAt} text={notification.iori?.bluesky?.text} />
        </div>
      </div>
    </article>
  );
};

export const NotificationItem = ({ notification, recipientUsername }: Props) => {
  switch (notification.type) {
    case 'favourite':
      return <LikeNotificationItem notification={notification} recipientUsername={recipientUsername} />;
    case 'reblog':
      return <ReblogNotificationItem notification={notification} recipientUsername={recipientUsername} />;
    case 'follow':
      return <FollowNotificationItem notification={notification} />;
    case IORI_EMOJI_REACTION_TYPE:
      return <EmojiReactNotificationItem notification={notification} recipientUsername={recipientUsername} />;
    case 'mention':
      return <MentionNotificationItem notification={notification} recipientUsername={recipientUsername} />;
    default:
      return null;
  }
};
