import type { BlueskyStatus } from '../api/mastodonClient.ts';
import { blueskyStatusNotices, type BlueskyStatusPage } from './blueskyStatusNotices.ts';

type Props = Readonly<{
  status: BlueskyStatus | undefined;
  page: BlueskyStatusPage;
  clientLoadFailed: boolean;
  now?: number;
}>;

export const BlueskyStatusNotice = ({ status, page, clientLoadFailed, now = Date.now() }: Props) => {
  const notices = blueskyStatusNotices({ status, page, clientLoadFailed, now });
  if (notices.length === 0) return null;
  return (
    <div class='space-y-3'>
      {notices.map((notice) => (
        <div
          key={notice.title}
          role='status'
          class='rounded-clay border border-terracotta/30 bg-cream dark:bg-gray-800 p-4 text-sm'
        >
          <p class='font-medium text-terracotta dark:text-terracotta-light'>{notice.title}</p>
          <p class='mt-1 text-charcoal-light dark:text-gray-400'>{notice.detail}</p>
          {notice.action !== undefined && (
            <button
              type='button'
              onClick={() => window.location.reload()}
              class='mt-2 text-terracotta hover:text-terracotta-dark dark:text-terracotta-light transition-colors'
            >
              {notice.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
