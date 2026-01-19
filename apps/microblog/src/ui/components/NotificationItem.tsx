import { Actor } from '../../domain/actor/actor.ts';
import { LocalActor } from '../../domain/actor/localActor.ts';
import { RemoteActor } from '../../domain/actor/remoteActor.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type {
  EmojiReactNotificationWithDetails,
  FollowNotificationWithDetails,
  LikeNotificationWithDetails,
  NotificationWithDetails,
} from '../../domain/notification/notification.ts';

type Props = Readonly<{
  notification: NotificationWithDetails;
  sanitizedContent: string;
}>;

const LikeNotificationItem = ({
  notification,
  sanitizedContent,
}: {
  notification: LikeNotificationWithDetails;
  sanitizedContent: string;
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

  const postUrl = `/posts/${likedPost.postId}`;

  return (
    <article class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 hover:shadow-puffy dark:hover:shadow-puffy-dark transition-shadow'>
      <div class='flex items-start gap-3'>
        <div class='flex-shrink-0 w-8 h-8 rounded-xl bg-pink-100 dark:bg-pink-900 flex items-center justify-center'>
          <svg
            class='w-4 h-4 text-pink-500 dark:text-pink-400'
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
              <div class='w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-semibold flex-shrink-0'>
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
              <span class='text-sm font-medium text-gray-900 dark:text-white truncate'>
                {handle}
              </span>
            </a>
            <span class='text-sm text-gray-500 dark:text-gray-400 flex-shrink-0'>
              liked your post
            </span>
          </div>

          <div
            role='button'
            class='block p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
          >
            <div
              class='text-sm text-gray-800 dark:text-gray-200 line-clamp-2 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_p]:text-gray-800 dark:[&_p]:text-gray-200 [&_p]:m-0'
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          </div>
          <a href={postUrl} title={new Date(createdAt).toLocaleString()}>
            <time
              dateTime={new Date(createdAt).toISOString()}
              class='block mt-2 text-xs text-gray-400 dark:text-gray-500 cursor-pointer'
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
    <article class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 hover:shadow-puffy dark:hover:shadow-puffy-dark transition-shadow'>
      <div class='flex items-start gap-3'>
        <div class='flex-shrink-0 w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center'>
          <svg
            class='w-4 h-4 text-blue-500 dark:text-blue-400'
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
              <div class='w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-semibold flex-shrink-0'>
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
              <span class='text-sm font-medium text-gray-900 dark:text-white truncate'>
                {handle}
              </span>
            </a>
            <span class='text-sm text-gray-500 dark:text-gray-400 flex-shrink-0'>
              started following you
            </span>
          </div>

          <time
            dateTime={new Date(createdAt).toISOString()}
            class='block mt-2 text-xs text-gray-400 dark:text-gray-500'
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
}: {
  notification: EmojiReactNotificationWithDetails;
  sanitizedContent: string;
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

  const postUrl = `/posts/${reactedPost.postId}`;

  const emojiDisplay = emojiImageUrl
    ? <img src={emojiImageUrl} alt={emoji} class='w-6 h-6 object-contain' />
    : <span class='text-lg'>{emoji}</span>;

  return (
    <article class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 hover:shadow-puffy dark:hover:shadow-puffy-dark transition-shadow'>
      <div class='flex items-start gap-3'>
        <div class='flex-shrink-0 w-8 h-8 rounded-xl bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center'>
          {emojiDisplay}
        </div>

        <div class='flex-1 min-w-0'>
          <div class='flex items-center gap-2 mb-2'>
            <a
              href={actorUrl}
              class='flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1'
            >
              <div class='w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-semibold flex-shrink-0'>
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
              <span class='text-sm font-medium text-gray-900 dark:text-white truncate'>
                {handle}
              </span>
            </a>
            <span class='text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-shrink-0'>
              reacted with {emojiDisplay}
            </span>
          </div>

          <div
            role='button'
            class='block p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
          >
            <div
              class='text-sm text-gray-800 dark:text-gray-200 line-clamp-2 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_p]:text-gray-800 dark:[&_p]:text-gray-200 [&_p]:m-0'
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          </div>
          <a href={postUrl} title={new Date(createdAt).toLocaleString()}>
            <time
              dateTime={new Date(createdAt).toISOString()}
              class='block mt-2 text-xs text-gray-400 dark:text-gray-500 cursor-pointer'
            >
              {Instant.formatRelative(createdAt)}
            </time>
          </a>
        </div>
      </div>
    </article>
  );
};

export const NotificationItem = ({ notification, sanitizedContent }: Props) => {
  if (notification.notification.type === 'like') {
    return (
      <LikeNotificationItem
        notification={notification as LikeNotificationWithDetails}
        sanitizedContent={sanitizedContent}
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
      />
    );
  }

  return null;
};
