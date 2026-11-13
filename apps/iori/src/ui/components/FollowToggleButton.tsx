type Props = Readonly<{
  following: boolean;
  disabled: boolean;
  onClick: () => unknown;
}>;

const BASE_CLASS =
  'flex items-center justify-center p-2 rounded-xl border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
// フォロー中: 塗りつぶし。未フォロー（枠線のみ）と色だけでなく形でも見分けられるようにする
const FOLLOWING_CLASS =
  'border-sage-dark bg-sage-dark text-white hover:bg-sage dark:border-sage dark:bg-sage dark:text-gray-900 dark:hover:bg-sage-dark dark:hover:text-white';
const NOT_FOLLOWING_CLASS =
  'border-warm-gray-dark dark:border-gray-600 text-charcoal-light dark:text-gray-400 hover:border-sage-dark hover:text-sage-dark dark:hover:border-sage dark:hover:text-sage hover:bg-sand-light dark:hover:bg-gray-700';

const PersonPaths = () => (
  <>
    <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
    <circle cx='9' cy='7' r='4' />
  </>
);

export const FollowToggleButton = ({ following, disabled, onClick }: Props) => {
  const label = following ? 'フォロー解除' : 'フォロー';
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      class={`${BASE_CLASS} ${following ? FOLLOWING_CLASS : NOT_FOLLOWING_CLASS}`}
      title={label}
      aria-label={label}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        class='h-5 w-5'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
        aria-hidden='true'
      >
        <PersonPaths />
        {following
          ? <path d='M16 11l2 2 4-4' />
          : <path d='M19 8v6M16 11h6' />}
      </svg>
    </button>
  );
};
