import type { Child } from 'hono/jsx';

type Props = Readonly<{
  onClose: () => void;
  onSubmit: () => void;
  isSending: boolean;
  canSubmit: boolean;
  title?: string;
  submitLabel?: string;
  target?: Child;
  errorText?: string;
  counter?: Child;
  leadingActions?: Child;
  children: Child;
}>;

export const ReplyDialogShell = ({
  onClose,
  onSubmit,
  isSending,
  canSubmit,
  title = '返信',
  submitLabel = '返信する',
  target,
  errorText,
  counter,
  leadingActions,
  children,
}: Props) => (
  <div
    class='fixed inset-0 bg-charcoal/50 backdrop-blur-sm flex items-center justify-center z-50'
    onClick={onClose}
  >
    <div
      class='bg-cream dark:bg-gray-800 md:rounded-clay shadow-clay dark:shadow-clay-dark p-4 md:p-6 w-full h-full md:h-auto md:max-w-lg md:mx-4 flex flex-col'
      onClick={(e) => e.stopPropagation()}
    >
      <div class='flex items-center justify-between mb-4'>
        <h2 class='text-lg font-semibold text-charcoal dark:text-white'>
          {title}
        </h2>
        <button
          type='button'
          onClick={onClose}
          class='p-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 transition-colors rounded-xl hover:bg-sand-light dark:hover:bg-gray-700'
        >
          <svg class='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
          </svg>
        </button>
      </div>

      {target}

      {children}

      {errorText !== undefined && <p role='alert' class='mt-3 text-terracotta text-sm'>{errorText}</p>}

      <div class='mt-3 flex gap-2 justify-end'>
        {leadingActions}
        {counter}
        <button
          type='button'
          onClick={onClose}
          class='px-4 py-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'
          disabled={isSending}
        >
          キャンセル
        </button>
        <button
          type='button'
          onClick={onSubmit}
          class={`px-5 py-2 text-white text-sm font-medium rounded-clay transition-all ${
            canSubmit
              ? 'bg-terracotta hover:bg-terracotta-dark shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
              : 'bg-warm-gray-dark cursor-not-allowed'
          }`}
          disabled={!canSubmit}
        >
          {isSending ? '送信中...' : submitLabel}
        </button>
      </div>
    </div>
  </div>
);
