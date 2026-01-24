import { useEffect, useRef, useState } from 'hono/jsx';

type TabMode = 'markdown' | 'preview';

type Props = Readonly<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
  replyToUsername?: string;
  isSubmitting: boolean;
}>;

export const ReplyModal = ({
  isOpen,
  onClose,
  onSubmit,
  replyToUsername,
  isSubmitting,
}: Props) => {
  const [content, setContent] = useState('');
  const [activeTab, setActiveTab] = useState<TabMode>('markdown');
  const [previewHtml, setPreviewHtml] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setPreviewHtml('');
      setActiveTab('markdown');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleContentChange = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    const value = target.value;
    setContent(value);

    if (
      typeof window !== 'undefined'
      && (window as unknown as { marked?: { parse: (text: string, options?: { async: boolean }) => string } }).marked
    ) {
      const rawHtml =
        (window as unknown as { marked: { parse: (text: string, options?: { async: boolean }) => string } }).marked
          .parse(value, { async: false });
      setPreviewHtml(rawHtml);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (content.trim() && !isSubmitting) {
        handleSubmit();
      }
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting) return;
    await onSubmit(content);
    setContent('');
    setPreviewHtml('');
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      class='fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 backdrop-blur-sm'
      onClick={handleBackdropClick}
    >
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4 md:p-6 w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col'>
        {/* Header */}
        <div class='flex items-center justify-between mb-4 flex-shrink-0'>
          <h2 class='text-lg font-semibold text-charcoal dark:text-white'>
            {replyToUsername ? `@${replyToUsername} に返信` : '返信'}
          </h2>
          <button
            type='button'
            onClick={onClose}
            class='text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-white transition-colors'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              class='h-6 w-6'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              stroke-width='2'
            >
              <path stroke-linecap='round' stroke-linejoin='round' d='M6 18L18 6M6 6l12 12' />
            </svg>
          </button>
        </div>

        {/* Tab Bar */}
        <div class='flex gap-1 mb-3 flex-shrink-0 bg-warm-gray dark:bg-gray-700 p-1 rounded-xl w-fit'>
          <button
            type='button'
            onClick={() => setActiveTab('markdown')}
            class={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'markdown'
                ? 'bg-cream dark:bg-gray-600 text-terracotta dark:text-terracotta-light shadow-clay-sm'
                : 'text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-300'
            }`}
          >
            Markdown
          </button>
          <button
            type='button'
            onClick={() => setActiveTab('preview')}
            class={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'preview'
                ? 'bg-cream dark:bg-gray-600 text-terracotta dark:text-terracotta-light shadow-clay-sm'
                : 'text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-300'
            }`}
          >
            Preview
          </button>
        </div>

        {/* Content Area */}
        <div class='flex-1 min-h-0'>
          {activeTab === 'markdown'
            ? (
              <textarea
                ref={textareaRef}
                value={content}
                onInput={handleContentChange}
                onKeyDown={handleKeyDown}
                placeholder='返信を書く... (⌘+Enter to post)'
                class='w-full h-full min-h-[150px] px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset resize-none transition-all'
                disabled={isSubmitting}
              />
            )
            : (
              <div class='min-h-[150px] px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset overflow-y-auto'>
                {previewHtml
                  ? (
                    <div
                      class='text-charcoal dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_p]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-2'
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  )
                  : (
                    <p class='text-charcoal-light dark:text-gray-500'>
                      Nothing to preview
                    </p>
                  )}
              </div>
            )}
        </div>

        {/* Action Buttons */}
        <div class='mt-4 flex gap-2 justify-end flex-shrink-0'>
          <button
            type='button'
            onClick={onClose}
            class='px-4 py-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'
          >
            キャンセル
          </button>
          <button
            type='button'
            onClick={handleSubmit}
            class={`px-5 py-2 text-white text-sm font-medium rounded-clay transition-all ${
              isSubmitting || !content.trim()
                ? 'bg-warm-gray-dark cursor-not-allowed'
                : 'bg-terracotta hover:bg-terracotta-dark shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
            }`}
            disabled={isSubmitting || !content.trim()}
          >
            {isSubmitting ? '送信中...' : '返信する'}
          </button>
        </div>
      </div>
    </div>
  );
};
