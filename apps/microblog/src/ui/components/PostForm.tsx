import { useRef, useState } from 'hono/jsx';

type Props = Readonly<{
  id?: string;
  formId?: string;
}>;

type TabMode = 'markdown' | 'preview';

export const PostForm = ({ id, formId }: Props) => {
  const [content, setContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabMode>('markdown');
  const formRef = useRef<HTMLFormElement>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    // Command+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
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

  const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/v1/upload', {
          method: 'POST',
          body: formData,
        });
        const result = await res.json();
        if (result.url) {
          newUrls.push(result.url);
        } else if (result.error) {
          alert('Upload failed: ' + result.error);
        }
      } catch (err) {
        alert('Upload failed: ' + (err as Error).message);
      }
    }

    setUploadedUrls((prev) => [...prev, ...newUrls]);
    setIsUploading(false);
    target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setUploadedUrls((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <form id={formId ?? id} method='post' action='/posts' ref={formRef} class='flex flex-col flex-1 min-h-0'>
      {/* Tab Bar */}
      <div class='flex gap-1 mb-3 flex-shrink-0'>
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
              class='w-full h-full min-h-[150px] px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none'
            />
          )
          : (
            <div class='h-full min-h-[150px] px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 overflow-y-auto'>
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

      <input type='hidden' name='imageUrls' value={uploadedUrls.join(',')} />
      {uploadedUrls.length > 0 && (
        <div class='mt-3 flex flex-wrap gap-2 flex-shrink-0'>
          {uploadedUrls.map((url, index) => (
            <div key={url} class='relative group'>
              <img src={url} alt='Preview' class='w-16 h-16 object-cover rounded-xl' />
              <button
                type='button'
                onClick={() => handleRemoveImage(index)}
                class='absolute -top-1 -right-1 w-5 h-5 bg-red-400 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity'
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      <div class='mt-2 flex justify-end items-center gap-3 flex-shrink-0'>
        <label class='cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors'>
          {isUploading
            ? <span class='text-xs'>Uploading...</span>
            : (
              <svg class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  stroke-width='2'
                  d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
                />
              </svg>
            )}
          <input
            type='file'
            accept='image/jpeg,image/png,image/gif,image/webp'
            multiple
            class='hidden'
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </label>
        <button
          type='submit'
          class='px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-2xl transition-colors'
        >
          投稿する
        </button>
      </div>
    </form>
  );
};
