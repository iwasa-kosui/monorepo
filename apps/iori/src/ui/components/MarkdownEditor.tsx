import { useEffect, useState } from 'hono/jsx';

import { shouldResetPreview } from './markdownEditorPreview.ts';

type TabMode = 'markdown' | 'preview';

type Props = Readonly<{
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  placeholder?: string;
  minHeight?: string;
  disabled?: boolean;
  name?: string;
}>;

export const MarkdownEditor = ({
  value,
  onChange,
  onKeyDown,
  placeholder = 'What\'s on your mind?',
  minHeight = '150px',
  disabled = false,
  name,
}: Props) => {
  const [activeTab, setActiveTab] = useState<TabMode>('markdown');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    if (!shouldResetPreview(value)) return;
    setActiveTab('markdown');
    setPreviewHtml('');
    setPreviewError('');
  }, [value]);

  const fetchPreview = async (markdown: string) => {
    if (!markdown.trim()) {
      setPreviewHtml('');
      setPreviewError('');
      return;
    }
    setIsLoadingPreview(true);
    try {
      const res = await fetch('/api/iori/v1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      });
      if (!res.ok) {
        setPreviewHtml('');
        setPreviewError(`プレビューを表示できませんでした（${res.status}）`);
        return;
      }
      const data = await res.json();
      if (data.html) {
        setPreviewHtml(data.html);
        setPreviewError('');
      }
    } catch (error) {
      console.error('Failed to fetch preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleTabChange = (tab: TabMode) => {
    setActiveTab(tab);
    if (tab === 'preview') {
      fetchPreview(value);
    }
  };

  const handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    onChange(target.value);
  };

  return (
    <div class='flex flex-col flex-1 min-h-0'>
      {/* Content Area */}
      <div class='relative flex-1 min-h-0'>
        {activeTab === 'markdown'
          ? (
            <textarea
              name={name}
              placeholder={placeholder}
              required={!!name}
              value={value}
              onInput={handleInput}
              onKeyDown={onKeyDown}
              disabled={disabled}
              class='w-full h-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset resize-none transition-all pb-9'
              style={{ minHeight }}
            />
          )
          : (
            <div
              class='h-full px-4 py-3 pb-9 rounded-clay bg-warm-gray dark:bg-gray-700 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset overflow-y-auto'
              style={{ minHeight }}
            >
              {isLoadingPreview
                ? (
                  <p class='text-charcoal-light dark:text-gray-500'>
                    Loading preview...
                  </p>
                )
                : previewError
                ? (
                  <p class='text-red-600 dark:text-red-400'>
                    {previewError}
                  </p>
                )
                : previewHtml
                ? (
                  <div
                    class='text-charcoal dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_p]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:p-4 [&_code]:text-sm [&_pre_code]:bg-transparent [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-2'
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
        <button
          type='button'
          aria-pressed={activeTab === 'preview'}
          onClick={() => handleTabChange(activeTab === 'preview' ? 'markdown' : 'preview')}
          class={`absolute bottom-2 right-2 px-2 py-0.5 text-xs rounded-full transition-colors ${
            activeTab === 'preview'
              ? 'bg-terracotta/10 text-terracotta dark:text-terracotta-light'
              : 'text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light'
          }`}
        >
          {activeTab === 'preview' ? '編集に戻る' : 'プレビュー'}
        </button>
      </div>

      {/* Hidden input for form submission when in preview mode */}
      {activeTab === 'preview' && name && <input type='hidden' name={name} value={value} />}
    </div>
  );
};
