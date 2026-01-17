import { Actor } from '../../domain/actor/actor.ts';
import { LocalActor } from '../../domain/actor/localActor.ts';
import { RemoteActor } from '../../domain/actor/remoteActor.ts';
import type { NotificationWithDetails } from '../../domain/notification/notification.ts';

type Props = Readonly<{
  notification: NotificationWithDetails;
  sanitizedContent: string;
}>;

export const NotificationItem = ({ notification, sanitizedContent }: Props) => {
  const { likerActor, likedPost, createdAt } = notification;

  const handle = Actor.match({
    onLocal: LocalActor.getHandle,
    onRemote: (x) => RemoteActor.getHandle(x) ?? likerActor.uri,
  })(likerActor);

  const actorUrl = Actor.match({
    onLocal: (x) => x.uri,
    onRemote: (x) => `/remote-users/${x.id}`,
  })(likerActor);

  // Get post URL - for local posts, use /users/:username/posts/:postId
  const postUrl = likedPost.type === 'local'
    ? `/posts/${likedPost.postId}`
    : `/posts/${likedPost.postId}`;

  return (
    <article class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow'>
      <div class='flex items-start gap-3'>
        {/* Like icon */}
        <div class='flex-shrink-0 w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-900 flex items-center justify-center'>
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
          {/* Actor info */}
          <div class='flex items-center gap-2 mb-2'>
            <a
              href={actorUrl}
              class='flex items-center gap-2 hover:opacity-80 transition-opacity'
            >
              <div class='w-6 h-6 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0'>
                {likerActor.logoUri
                  ? (
                    <img
                      src={likerActor.logoUri}
                      alt='Actor Logo'
                      class='w-6 h-6 rounded-full object-cover'
                    />
                  )
                  : handle.charAt(0).toUpperCase()}
              </div>
              <span class='text-sm font-medium text-gray-900 dark:text-white truncate'>
                {handle}
              </span>
            </a>
            <span class='text-sm text-gray-500 dark:text-gray-400'>
              liked your post
            </span>
          </div>

          {/* Post preview */}
          <a
            href={postUrl}
            class='block p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
          >
            <div
              class='text-sm text-gray-600 dark:text-gray-300 line-clamp-2 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400'
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          </a>

          {/* Timestamp */}
          <time
            dateTime={new Date(createdAt).toISOString()}
            class='block mt-2 text-xs text-gray-400 dark:text-gray-500'
          >
            {new Date(createdAt).toLocaleString()}
          </time>
        </div>
      </div>
    </article>
  );
};
