import { useState } from 'hono/jsx';

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
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const fetchPreview = async (markdown: string) => {
    if (!markdown.trim()) {
      setPreviewHtml('');
      return;
    }
    setIsLoadingPreview(true);
    try {
      const res = await fetch('/api/v1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      });
      const data = await res.json();
      if (data.html) {
        setPreviewHtml(data.html);
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
      {/* Tab Bar */}
      <div class='flex gap-1 mb-3 flex-shrink-0 bg-warm-gray dark:bg-gray-700 p-1 rounded-xl w-fit'>
        <button
          type='button'
          onClick={() => handleTabChange('markdown')}
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
          onClick={() => handleTabChange('preview')}
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
              name={name}
              placeholder={placeholder}
              required={!!name}
              value={value}
              onInput={handleInput}
              onKeyDown={onKeyDown}
              disabled={disabled}
              class='w-full h-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset resize-none transition-all'
              style={{ minHeight }}
            />
          )
          : (
            <div
              class='h-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset overflow-y-auto'
              style={{ minHeight }}
            >
              {isLoadingPreview
                ? (
                  <p class='text-charcoal-light dark:text-gray-500'>
                    Loading preview...
                  </p>
                )
                : previewHtml
                ? (
                  <div
                    class='text-charcoal dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_p]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:p-4 [&_code]:text-sm [&_pre_code]:bg-transparent'
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

      {/* Hidden input for form submission when in preview mode */}
      {activeTab === 'preview' && name && <input type='hidden' name={name} value={value} />}
    </div>
  );
};
