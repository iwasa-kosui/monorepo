type Props = Readonly<{
  fetchEnabled: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  message: string;
}>;

export const XFetchControl = ({ fetchEnabled, isRefreshing, onRefresh, message }: Props) => (
  <div class='flex flex-col items-end gap-2'>
    {fetchEnabled
      ? (
        <button
          type='button'
          onClick={onRefresh}
          disabled={isRefreshing}
          class='px-4 py-2 bg-sage-dark hover:bg-sage disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
        >
          {isRefreshing ? '取得中...' : '今すぐ取得'}
        </button>
      )
      : <p class='text-sm text-charcoal-light dark:text-gray-400'>取り込みは無効です</p>}
    {message && <p role='status' class='text-sm text-charcoal-light dark:text-gray-400'>{message}</p>}
  </div>
);
