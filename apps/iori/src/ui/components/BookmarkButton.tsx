type Props = Readonly<{
  bookmarked: boolean;
  onBookmark: (() => void) | undefined;
  onUndoBookmark: (() => void) | undefined;
}>;

/**
 * 投稿のアクション列に置くブックマークのボタン。
 * 押せる操作が無い状態（未ブックマークで onBookmark が無い、など）では何も描かない。
 */
export const BookmarkButton = ({ bookmarked, onBookmark, onUndoBookmark }: Props) => {
  const action = bookmarked ? onUndoBookmark : onBookmark;
  if (action === undefined) return null;
  const label = bookmarked ? 'ブックマークを外す' : 'ブックマーク';
  return (
    <button
      type='button'
      onClick={(event: Event) => {
        event.stopPropagation();
        action();
      }}
      class={`flex items-center gap-1 transition-colors ${
        bookmarked
          ? 'text-terracotta dark:text-terracotta-light'
          : 'text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={bookmarked}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        class='h-5 w-5'
        fill={bookmarked ? 'currentColor' : 'none'}
        viewBox='0 0 24 24'
        stroke='currentColor'
        stroke-width='2'
      >
        <path
          stroke-linecap='round'
          stroke-linejoin='round'
          d='M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'
        />
      </svg>
    </button>
  );
};
