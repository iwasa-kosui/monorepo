import { useEffect, useState } from 'hono/jsx';

export type ReportCategory = 'spam' | 'offensive' | 'other';

type Props = Readonly<{
  targetLabel: string;
  isOpen: boolean;
  isSubmitting: boolean;
  error?: string;
  onSubmit: (input: { category: ReportCategory; comment: string }) => void;
  onClose: () => void;
}>;

const CATEGORY_OPTIONS: ReadonlyArray<Readonly<{ value: ReportCategory; label: string }>> = [
  { value: 'spam', label: 'スパム' },
  { value: 'offensive', label: '不快・攻撃的な内容' },
  { value: 'other', label: 'その他' },
];

export const ReportModal = ({ targetLabel, isOpen, isSubmitting, error, onSubmit, onClose }: Props) => {
  const [category, setCategory] = useState<ReportCategory | undefined>(undefined);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setCategory(undefined);
      setComment('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = category !== undefined && !isSubmitting;

  const handleSubmit = () => {
    if (category === undefined || isSubmitting) return;
    onSubmit({ category, comment: comment.trim() });
  };

  return (
    <div
      class='fixed inset-0 bg-charcoal/50 backdrop-blur-sm flex items-center justify-center z-50'
      onClick={onClose}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby='report-modal-title'
        class='bg-cream dark:bg-gray-800 md:rounded-clay shadow-clay dark:shadow-clay-dark p-4 md:p-6 w-full h-full md:h-auto md:max-w-lg md:mx-4 flex flex-col'
        onClick={(e) => e.stopPropagation()}
      >
        <div class='flex items-center justify-between mb-4'>
          <h2 id='report-modal-title' class='text-lg font-semibold text-charcoal dark:text-white'>
            {`${targetLabel} を通報`}
          </h2>
          <button
            type='button'
            onClick={onClose}
            aria-label='閉じる'
            class='p-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 transition-colors rounded-xl hover:bg-sand-light dark:hover:bg-gray-700'
          >
            <svg class='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
            </svg>
          </button>
        </div>

        <fieldset class='mb-4 space-y-2' disabled={isSubmitting}>
          <legend class='text-sm font-medium text-charcoal dark:text-gray-200 mb-2'>通報の理由</legend>
          {CATEGORY_OPTIONS.map((option) => (
            <label
              key={option.value}
              class='flex items-center gap-2 text-sm text-charcoal dark:text-gray-200 cursor-pointer'
            >
              <input
                type='radio'
                name='report-category'
                value={option.value}
                checked={category === option.value}
                onChange={() => setCategory(option.value)}
                class='accent-terracotta'
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <label class='text-sm font-medium text-charcoal dark:text-gray-200 mb-2' for='report-modal-comment'>
          コメント（任意）
        </label>
        <textarea
          id='report-modal-comment'
          value={comment}
          onInput={(e: Event) => setComment((e.target as HTMLTextAreaElement).value)}
          class='w-full min-h-[120px] px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset resize-none transition-all'
          disabled={isSubmitting}
        />

        {error !== undefined && error !== '' && (
          <p role='alert' class='mt-3 text-sm text-terracotta dark:text-terracotta-light'>{error}</p>
        )}

        <div class='mt-3 flex gap-2 justify-end'>
          <button
            type='button'
            onClick={onClose}
            class='px-4 py-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'
            disabled={isSubmitting}
          >
            キャンセル
          </button>
          <button
            type='button'
            onClick={handleSubmit}
            class={`px-5 py-2 text-white text-sm font-medium rounded-clay transition-all ${
              canSubmit
                ? 'bg-terracotta hover:bg-terracotta-dark shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
                : 'bg-warm-gray-dark cursor-not-allowed'
            }`}
            disabled={!canSubmit}
          >
            通報する
          </button>
        </div>
      </div>
    </div>
  );
};
