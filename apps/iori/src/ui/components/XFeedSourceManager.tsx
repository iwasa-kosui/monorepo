import type { FeedSource } from '../api/mastodonClient.ts';
import { formatPostedAt } from './XPostList.tsx';

type Props = Readonly<{
  sources: readonly FeedSource[];
  username: string;
  isAdding: boolean;
  addError: string;
  togglingIds: readonly string[];
  toggleError: string;
  onUsernameInput: (username: string) => void;
  onAdd: () => void;
  onToggle: (source: FeedSource) => void;
}>;

export const XFeedSourceManager = ({
  sources,
  username,
  isAdding,
  addError,
  togglingIds,
  toggleError,
  onUsernameInput,
  onAdd,
  onToggle,
}: Props) => (
  <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 mb-8'>
    <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-4'>取り込む X のユーザー</h2>
    <form
      class='flex gap-2 mb-2'
      onSubmit={(e: Event) => {
        e.preventDefault();
        onAdd();
      }}
    >
      <input
        type='text'
        value={username}
        onInput={(e: Event) => onUsernameInput((e.target as HTMLInputElement).value)}
        placeholder='@ユーザー名'
        aria-label='X のユーザー名'
        autocapitalize='off'
        autocomplete='off'
        class='flex-1 min-w-0 px-4 py-2 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset'
      />
      <button
        type='submit'
        disabled={isAdding}
        class='flex-shrink-0 px-4 py-2 bg-terracotta hover:bg-terracotta-dark disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
      >
        {isAdding ? '追加中...' : '追加'}
      </button>
    </form>
    {addError && <p role='alert' class='mb-2 text-sm text-terracotta-dark dark:text-terracotta-light'>{addError}</p>}
    {toggleError && (
      <p role='alert' class='mb-2 text-sm text-terracotta-dark dark:text-terracotta-light'>{toggleError}</p>
    )}
    {sources.length === 0
      ? (
        <p class='mt-4 text-sm text-charcoal-light dark:text-gray-400'>
          取り込む X のユーザーがまだいません。上のフォームからユーザー名を追加してください。
        </p>
      )
      : (
        <ul class='mt-4 space-y-3'>
          {sources.map((source) => (
            <li
              key={source.feedSourceId}
              class='flex items-start justify-between gap-4 pt-3 border-t border-warm-gray-dark/30 dark:border-gray-700'
            >
              <div class='min-w-0'>
                <div class='flex items-center gap-2'>
                  <span class='font-medium text-charcoal dark:text-white truncate'>{source.title}</span>
                  {source.enabled
                    ? (
                      <span class='px-2 py-0.5 text-xs font-medium rounded-full bg-sage/30 dark:bg-sage-dark/30 text-sage-dark dark:text-sage'>
                        有効
                      </span>
                    )
                    : (
                      <span class='px-2 py-0.5 text-xs font-medium rounded-full bg-warm-gray dark:bg-gray-700 text-charcoal-light dark:text-gray-400'>
                        無効
                      </span>
                    )}
                </div>
                <p class='mt-1 text-xs text-charcoal-light dark:text-gray-400'>
                  最後に取得: {source.lastFetchedAt === null
                    ? '未取得'
                    : <time datetime={source.lastFetchedAt}>{formatPostedAt(source.lastFetchedAt)}</time>}
                </p>
                {source.lastError !== null && (
                  <p class='mt-1 text-xs break-words text-terracotta-dark dark:text-terracotta-light'>
                    エラー: {source.lastError}
                  </p>
                )}
              </div>
              <button
                type='button'
                onClick={() => onToggle(source)}
                disabled={togglingIds.includes(source.feedSourceId)}
                class='flex-shrink-0 px-3 py-1.5 bg-sand hover:bg-sand-light disabled:opacity-50 text-rust text-sm font-medium rounded-xl transition-all shadow-clay-sm'
              >
                {source.enabled ? '無効にする' : '有効にする'}
              </button>
            </li>
          ))}
        </ul>
      )}
  </div>
);
