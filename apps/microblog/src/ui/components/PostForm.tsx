import { useState } from 'hono/jsx';

type Props = Readonly<{
  id?: string;
  formId?: string;
}>;

export const PostForm = ({ id, formId }: Props) => {
  const [content, setContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

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
    <form
      id={formId ?? id}
      method='post'
      action='/posts'
      class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4'
    >
      <textarea
        name='content'
        rows={4}
        placeholder="What's on your mind?"
        required
        value={content}
        onInput={handleContentChange}
        class='w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none'
      />
      <input type='hidden' name='imageUrls' value={uploadedUrls.join(',')} />
      {previewHtml && (
        <div
          class='mt-2 text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5'
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}
      {uploadedUrls.length > 0 && (
        <div class='mt-2 flex flex-wrap gap-2'>
          {uploadedUrls.map((url, index) => (
            <div key={url} class='relative group'>
              <img
                src={url}
                alt='Preview'
                class='w-20 h-20 object-cover rounded-lg'
              />
              <button
                type='button'
                onClick={() => handleRemoveImage(index)}
                class='absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity'
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      <div class='mt-3 flex justify-between items-center'>
        <label class='cursor-pointer flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            class='h-6 w-6'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
            />
          </svg>
          <span class='text-sm'>{isUploading ? 'Uploading...' : 'Add Image'}</span>
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
          class='px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800'
        >
          Post
        </button>
      </div>
    </form>
  );
};
