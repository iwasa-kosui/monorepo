import type { IoriXPostBody } from '../../adaptor/routes/workerIoriXPostsRouter.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';

type Props = Readonly<{
  posts: readonly IoriXPostBody[];
}>;

export const formatPostedAt = (postedAt: string): string =>
  new Date(postedAt).toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const XPostList = ({ posts }: Props) => (
  <div class='space-y-4'>
    {posts.map((post) => {
      const href = safeAbsoluteUrl(post.url);
      return (
        <article
          key={post.feedEntryId}
          class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5'
        >
          <div class='flex items-center justify-between gap-4 mb-2 text-sm text-charcoal-light dark:text-gray-400'>
            <span class='font-medium text-charcoal dark:text-white truncate'>{post.sourceTitle}</span>
            <time datetime={post.postedAt} class='flex-shrink-0'>{formatPostedAt(post.postedAt)}</time>
          </div>
          <p class='whitespace-pre-wrap break-words text-charcoal dark:text-gray-100'>{post.text}</p>
          {href !== undefined && (
            <a
              href={href}
              target='_blank'
              rel='noopener noreferrer'
              class='inline-block mt-3 text-sm text-terracotta hover:underline'
            >
              元の投稿
            </a>
          )}
        </article>
      );
    })}
  </div>
);
