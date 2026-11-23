type Props = Readonly<{
  disabled: boolean;
  onClick: () => unknown;
}>;

export const MessageButton = ({ disabled, onClick }: Props) => (
  <button
    type='button'
    onClick={onClick}
    disabled={disabled}
    class='flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
    title='メッセージ'
    aria-label='メッセージ'
  >
    <svg
      xmlns='http://www.w3.org/2000/svg'
      class='h-5 w-5'
      fill='none'
      viewBox='0 0 24 24'
      stroke='currentColor'
      stroke-width='2'
    >
      <path
        stroke-linecap='round'
        stroke-linejoin='round'
        d='M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
      />
    </svg>
  </button>
);
