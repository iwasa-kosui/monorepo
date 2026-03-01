import { Actor } from '../../domain/actor/actor.ts';
import { LocalActor } from '../../domain/actor/localActor.ts';
import { RemoteActor } from '../../domain/actor/remoteActor.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type {
  EmojiReactNotificationWithDetails,
  FollowNotificationWithDetails,
  LikeNotificationWithDetails,
  NotificationWithDetails,
  ReplyNotificationWithDetails,
} from '../../domain/notification/notification.ts';

type Props = Readonly<{
  notification: NotificationWithDetails;
  sanitizedContent: string;
  recipientUsername: string;
}>;

const LikeNotificationItem = ({
  notification,
  sanitizedContent,
  recipientUsername,
}: {
  notification: LikeNotificationWithDetails;
  sanitizedContent: string;
  recipientUsername: string;
}) => {
  const { likerActor, likedPost, createdAt } = notification;

  const handle = Actor.match({
    onLocal: LocalActor.getHandle,
    onRemote: (x) => RemoteActor.getHandle(x) ?? likerActor.uri,
  })(likerActor);

  const actorUrl = Actor.match({
    onLocal: (x) => x.uri,
    onRemote: (x) => `/remote-users/${x.id}`,
  })(likerActor);

  const postUrl = `/users/${recipientUsername}/posts/${likedPost.postId}`;

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
                {likerActor.logoUri
                  ? (
                    <img
                      src={likerActor.logoUri}
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

          <div
            role='button'
            class='block p-3 bg-sand-light/50 dark:bg-gray-700/50 rounded-xl hover:bg-sand-light dark:hover:bg-gray-700 transition-colors shadow-clay-inset'
          >
            <div
              class='text-sm text-charcoal dark:text-gray-200 line-clamp-2 prose dark:prose-invert prose-sm max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light [&_p]:text-charcoal dark:[&_p]:text-gray-200 [&_p]:m-0'
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          </div>
          <a href={postUrl} title={new Date(createdAt).toLocaleString()}>
            <time
              dateTime={new Date(createdAt).toISOString()}
              class='block mt-2 text-xs text-charcoal-light dark:text-gray-500 cursor-pointer hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
            >
              {Instant.formatRelative(createdAt)}
            </time>
          </a>
        </div>
      </div>
    </article>
  );
};

const FollowNotificationItem = ({
  notification,
}: {
  notification: FollowNotificationWithDetails;
}) => {
  const { followerActor, createdAt } = notification;

  const handle = Actor.match({
    onLocal: LocalActor.getHandle,
    onRemote: (x) => RemoteActor.getHandle(x) ?? followerActor.uri,
  })(followerActor);

  const actorUrl = Actor.match({
    onLocal: (x) => x.uri,
    onRemote: (x) => `/remote-users/${x.id}`,
  })(followerActor);

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
                {followerActor.logoUri
                  ? (
                    <img
                      src={followerActor.logoUri}
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

const EmojiReactNotificationItem = ({
  notification,
  sanitizedContent,
  recipientUsername,
}: {
  notification: EmojiReactNotificationWithDetails;
  sanitizedContent: string;
  recipientUsername: string;
}) => {
  const { reactorActor, reactedPost, createdAt } = notification;
  const { emoji, emojiImageUrl } = notification.notification;

  const handle = Actor.match({
    onLocal: LocalActor.getHandle,
    onRemote: (x) => RemoteActor.getHandle(x) ?? reactorActor.uri,
  })(reactorActor);

  const actorUrl = Actor.match({
    onLocal: (x) => x.uri,
    onRemote: (x) => `/remote-users/${x.id}`,
  })(reactorActor);

  const postUrl = `/users/${recipientUsername}/posts/${reactedPost.postId}`;

  const emojiDisplay = emojiImageUrl
    ? <img src={emojiImageUrl} alt={emoji} class='w-6 h-6 object-contain' />
    : <span class='text-lg'>{emoji}</span>;

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
                {reactorActor.logoUri
                  ? (
                    <img
                      src={reactorActor.logoUri}
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

          <div
            role='button'
            class='block p-3 bg-sand-light/50 dark:bg-gray-700/50 rounded-xl hover:bg-sand-light dark:hover:bg-gray-700 transition-colors shadow-clay-inset'
          >
            <div
              class='text-sm text-charcoal dark:text-gray-200 line-clamp-2 prose dark:prose-invert prose-sm max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light [&_p]:text-charcoal dark:[&_p]:text-gray-200 [&_p]:m-0'
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          </div>
          <a href={postUrl} title={new Date(createdAt).toLocaleString()}>
            <time
              dateTime={new Date(createdAt).toISOString()}
              class='block mt-2 text-xs text-charcoal-light dark:text-gray-500 cursor-pointer hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
            >
              {Instant.formatRelative(createdAt)}
            </time>
          </a>
        </div>
      </div>
    </article>
  );
};

const ReplyNotificationItem = ({
  notification,
  sanitizedContent,
  recipientUsername,
}: {
  notification: ReplyNotificationWithDetails;
  sanitizedContent: string;
  recipientUsername: string;
}) => {
  const { replierActor, createdAt, notification: { originalPostId } } = notification;

  const handle = Actor.match({
    onLocal: LocalActor.getHandle,
    onRemote: (x) => RemoteActor.getHandle(x) ?? replierActor.uri,
  })(replierActor);

  const actorUrl = Actor.match({
    onLocal: (x) => x.uri,
    onRemote: (x) => `/remote-users/${x.id}`,
  })(replierActor);

  const postUrl = `/users/${recipientUsername}/posts/${originalPostId}`;

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
                {replierActor.logoUri
                  ? (
                    <img
                      src={replierActor.logoUri}
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
              replied to your post
            </span>
          </div>

          <div
            role='button'
            class='block p-3 bg-sand-light/50 dark:bg-gray-700/50 rounded-xl hover:bg-sand-light dark:hover:bg-gray-700 transition-colors shadow-clay-inset'
          >
            <div
              class='text-sm text-charcoal dark:text-gray-200 line-clamp-2 prose dark:prose-invert prose-sm max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light [&_p]:text-charcoal dark:[&_p]:text-gray-200 [&_p]:m-0'
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          </div>
          <a href={postUrl} title={new Date(createdAt).toLocaleString()}>
            <time
              dateTime={new Date(createdAt).toISOString()}
              class='block mt-2 text-xs text-charcoal-light dark:text-gray-500 cursor-pointer hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
            >
              {Instant.formatRelative(createdAt)}
            </time>
          </a>
        </div>
      </div>
    </article>
  );
};

export const NotificationItem = ({ notification, sanitizedContent, recipientUsername }: Props) => {
  if (notification.notification.type === 'like') {
    return (
      <LikeNotificationItem
        notification={notification as LikeNotificationWithDetails}
        sanitizedContent={sanitizedContent}
        recipientUsername={recipientUsername}
      />
    );
  }

  if (notification.notification.type === 'follow') {
    return (
      <FollowNotificationItem
        notification={notification as FollowNotificationWithDetails}
      />
    );
  }

  if (notification.notification.type === 'emojiReact') {
    return (
      <EmojiReactNotificationItem
        notification={notification as EmojiReactNotificationWithDetails}
        sanitizedContent={sanitizedContent}
        recipientUsername={recipientUsername}
      />
    );
  }

  if (notification.notification.type === 'reply') {
    return (
      <ReplyNotificationItem
        notification={notification as ReplyNotificationWithDetails}
        sanitizedContent={sanitizedContent}
        recipientUsername={recipientUsername}
      />
    );
  }

  return null;
};
