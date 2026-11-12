import type { Status } from '../../adaptor/mastodon/entities.ts';

export const DIRECT_MARK_LABEL = 'ダイレクト';
export const DIRECT_MARK_TITLE = 'ダイレクトメッセージです。宛先に入っている人にだけ届きます';

export const isDirectStatus = (status: Pick<Status, 'visibility'>): boolean => status.visibility === 'direct';

export const DirectMark = () => (
  <span
    data-testid='direct-mark'
    title={DIRECT_MARK_TITLE}
    class='inline-flex items-center gap-1 flex-shrink-0 rounded-full bg-sand-light dark:bg-gray-700 px-2 py-0.5 text-xs text-charcoal-light dark:text-gray-300'
  >
    <svg
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden='true'
      class='h-3 w-3'
      fill='none'
      viewBox='0 0 24 24'
      stroke='currentColor'
      stroke-width='2'
    >
      <path
        stroke-linecap='round'
        stroke-linejoin='round'
        d='M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
      />
    </svg>
    {DIRECT_MARK_LABEL}
  </span>
);
