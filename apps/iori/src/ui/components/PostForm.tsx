import { useState } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { createStatus, uploadMedia } from '../api/mastodonClient.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { canSubmitPost, submitPost } from './postSubmission.ts';

type Props = Readonly<{
  id?: string;
  formId?: string;
  onPosted: (status: Status) => void;
}>;

export const PostForm = ({ id, formId, onPosted }: Props) => {
  const [content, setContent] = useState('');
  const [uploaded, setUploaded] = useState<{ id: string; url: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const handleSubmit = async () => {
    if (!canSubmitPost(content, isUploading, isPosting)) return;
    setIsPosting(true);
    try {
      const result = await submitPost({ content, uploaded }, { create: createStatus, onPosted });
      if (result.kind === 'posted') {
        setContent('');
        setUploaded([]);
      } else {
        alert(result.message);
      }
    } finally {
      setIsPosting(false);
    }
  };

  const handleFormSubmit = (e: Event) => {
    e.preventDefault();
    handleSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Command+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newMedia: { id: string; url: string }[] = [];

    for (const file of Array.from(files)) {
      try {
        const media = await uploadMedia(file);
        newMedia.push({ id: media.id, url: media.url });
      } catch (err) {
        alert('Upload failed: ' + (err as Error).message);
      }
    }

    setUploaded((prev) => [...prev, ...newMedia]);
    setIsUploading(false);
    target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setUploaded((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <form id={formId ?? id} onSubmit={handleFormSubmit} class='flex flex-col flex-1 min-h-0'>
      <MarkdownEditor
        value={content}
        onChange={setContent}
        onKeyDown={handleKeyDown}
        placeholder="What's on your mind? (⌘+Enter to post)"
        minHeight='150px'
        name='content'
      />

      {uploaded.length > 0 && (
        <div class='mt-3 flex flex-wrap gap-2 flex-shrink-0'>
          {uploaded.map(({ id: mediaId, url }, index) => (
            <div key={mediaId} class='relative group'>
              <img src={url} alt='Preview' class='w-16 h-16 object-cover rounded-xl shadow-clay-sm' />
              <button
                type='button'
                onClick={() => handleRemoveImage(index)}
                class='absolute -top-1 -right-1 w-5 h-5 bg-terracotta text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-clay-sm'
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      <div class='mt-2 flex justify-end items-center gap-3 flex-shrink-0'>
        <label class='cursor-pointer text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'>
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
          disabled={isPosting}
          class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
        >
          投稿する
        </button>
      </div>
    </form>
  );
};
