import { useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import { blueskyPostUrl } from '../../helper/blueskyUrl.ts';
import { type BlueskyPostThread, fetchBlueskyPostThread, isMastodonApiError } from '../api/mastodonClient.ts';
import { BlueskyTimelineItemView } from '../components/BlueskyTimelineItemView.tsx';

type ThreadNode = BlueskyPostThread['ancestors'][number];

const REPLY_INDENT_CLASSES = ['', 'ml-4', 'ml-8', 'ml-12'] as const;
const POST_PATH_PATTERN = /^\/bluesky\/profile\/([^/]+)\/post\/([^/]+)\/?$/;

const postUriFromLocation = (): string | undefined => {
  const match = POST_PATH_PATTERN.exec(window.location.pathname);
  if (match === null) return undefined;
  try {
    return `at://${decodeURIComponent(match[1]!)}/app.bsky.feed.post/${decodeURIComponent(match[2]!)}`;
  } catch {
    return undefined;
  }
};

const errorMessageOf = (error: unknown): string => {
  if (!isMastodonApiError(error)) return '読み込めませんでした。時間をおいて再度お試しください。';
  if (error.status === 403) return 'この投稿は所有者だけが見られます。';
  if (error.status === 404) return '投稿が見つからないか、表示できません。';
  if (error.status === 429) return 'Bluesky の利用上限に達しました。時間をおいて再度お試しください';
  return `読み込めませんでした: ${error.message}`;
};

const Placeholder = ({ text }: Readonly<{ text: string }>) => (
  <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 text-sm text-charcoal-light dark:text-gray-400'>
    {text}
  </div>
);

const ThreadNodeView = ({ node, isFocused }: Readonly<{ node: ThreadNode; isFocused?: boolean }>) => {
  if (node.kind === 'notFound') return <Placeholder text='削除されたか見つからない投稿' />;
  if (node.kind === 'blocked') return <Placeholder text='表示できない投稿（ブロック）' />;
  return <BlueskyTimelineItemView item={node.item} isSelected={isFocused === true} />;
};

const BlueskyPostPage = () => {
  const [thread, setThread] = useState<BlueskyPostThread | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const uri = postUriFromLocation();
    if (uri === undefined) {
      setError('投稿が見つからないか、表示できません。');
      setIsLoading(false);
      return;
    }
    fetchBlueskyPostThread(uri)
      .then(setThread)
      .catch((err) => setError(errorMessageOf(err)))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (thread !== null && thread.ancestors.length > 0) focusRef.current?.scrollIntoView({ block: 'start' });
  }, [thread]);

  if (isLoading) {
    return (
      <div class='flex items-center justify-center py-8'>
        <svg
          class='animate-spin h-8 w-8 text-terracotta'
          viewBox='0 0 24 24'
        >
          <circle
            class='opacity-25'
            cx='12'
            cy='12'
            r='10'
            stroke='currentColor'
            stroke-width='4'
            fill='none'
          />
          <path
            class='opacity-75'
            fill='currentColor'
            d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
          />
        </svg>
      </div>
    );
  }

  const openOnBluesky = thread === null ? undefined : blueskyPostUrl(thread.post.authorDid, thread.post.uri);

  return (
    <div class='flex flex-col h-full'>
      <div class='flex items-center justify-between mb-4 flex-shrink-0'>
        <a
          href='/'
          class='text-lg font-semibold text-charcoal dark:text-white hover:text-terracotta dark:hover:text-terracotta-light flex items-center gap-2 transition-colors'
        >
          <svg
            class='w-5 h-5'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M15 19l-7-7 7-7'
            />
          </svg>
          ホーム
        </a>
      </div>

      {error !== null && <div class='text-red-500 text-center py-8'>{error}</div>}

      {thread !== null && (
        <div class='flex-1 min-h-0 overflow-y-auto'>
          <div class='space-y-6 py-2'>
            {thread.ancestors.map((node) => (
              <ThreadNodeView key={node.kind === 'post' ? node.item.uri : node.uri} node={node} />
            ))}
            <div ref={focusRef} class='space-y-2'>
              <ThreadNodeView node={{ kind: 'post', item: thread.post }} isFocused />
              {openOnBluesky !== undefined && (
                <div class='text-right'>
                  <a
                    href={openOnBluesky}
                    target='_blank'
                    rel='noopener noreferrer'
                    class='text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
                  >
                    Bluesky で開く
                  </a>
                </div>
              )}
            </div>
            {thread.replies.map(({ depth, node }) => (
              <div
                key={node.kind === 'post' ? node.item.uri : node.uri}
                class={REPLY_INDENT_CLASSES[Math.min(depth, REPLY_INDENT_CLASSES.length - 1)]}
              >
                <ThreadNodeView node={node} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<BlueskyPostPage />, root);
}
