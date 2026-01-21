import { useRef, useState } from 'hono/jsx';

import { Modal } from './Modal.tsx';

type TabMode = 'markdown' | 'preview';

export const PostModal = () => {
  const [content, setContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [activeTab, setActiveTab] = useState<TabMode>('markdown');
  const formRef = useRef<HTMLFormElement>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (formRef.current && content.trim()) {
        formRef.current.submit();
      }
    }
  };

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

  return (
    <Modal
      id='post-modal'
      showCloseButton={false}
      fullScreen
    >
      <form method='post' action='/posts' ref={formRef} class='flex flex-col flex-1 min-h-0'>
        {/* Tab Bar */}
        <div class='flex gap-1 mb-3'>
          <button
            type='button'
            onClick={() => setActiveTab('markdown')}
            class={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'markdown'
                ? 'bg-gray-700 dark:bg-gray-600 text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Markdown
          </button>
          <button
            type='button'
            onClick={() => setActiveTab('preview')}
            class={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'preview'
                ? 'bg-gray-700 dark:bg-gray-600 text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
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
                name='content'
                placeholder="What's on your mind? (⌘+Enter to post)"
                required
                value={content}
                onInput={handleContentChange}
                onKeyDown={handleKeyDown}
                class='w-full h-full min-h-[200px] px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none'
              />
            )
            : (
              <div class='w-full h-full min-h-[200px] px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 overflow-y-auto'>
                {previewHtml
                  ? (
                    <div
                      class='text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5'
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  )
                  : (
                    <p class='text-gray-400 dark:text-gray-500'>
                      Nothing to preview
                    </p>
                  )}
              </div>
            )}
        </div>
        {/* Hidden input for form submission when in preview mode */}
        {activeTab === 'preview' && <input type='hidden' name='content' value={content} />}

        <div class='mt-3 flex gap-2 justify-end'>
          <a href='#'>
            <button
              type='button'
              class='px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'
            >
              Cancel
            </button>
          </a>
          <button
            type='submit'
            class='px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-2xl transition-colors'
          >
            投稿する
          </button>
        </div>
      </form>
    </Modal>
  );
};
