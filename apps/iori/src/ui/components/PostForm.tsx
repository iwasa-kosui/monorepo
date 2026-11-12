import { useState } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import { createStatus, updateMedia, uploadMedia } from '../api/mastodonClient.ts';
import { blueskyCrosspostNotice, postedMessage } from './blueskyCrosspostMark.ts';
import { downscaleImageForUpload } from './imageDownscale.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { DEFAULT_POST_DESTINATION } from './postDestination.ts';
import { PostDestinationSelect } from './PostDestinationSelect.tsx';
import { canSubmitPost, submitPost, type UploadedMedia } from './postSubmission.ts';
import { DEFAULT_POST_VISIBILITY, type PostVisibility } from './postVisibility.ts';
import { PostVisibilitySelect } from './PostVisibilitySelect.tsx';

type Props = Readonly<{
  id?: string;
  formId?: string;
  onPosted: (status: Status) => void;
}>;

export const PostForm = ({ id, formId, onPosted }: Props) => {
  const [content, setContent] = useState('');
  const [uploaded, setUploaded] = useState<UploadedMedia[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [destination, setDestination] = useState<PostDestination>(DEFAULT_POST_DESTINATION);
  const [visibility, setVisibility] = useState<PostVisibility>(DEFAULT_POST_VISIBILITY);
  const [resultMessage, setResultMessage] = useState('');
  const [cwEnabled, setCwEnabled] = useState(false);
  const [cw, setCw] = useState('');
  const [sensitiveChecked, setSensitiveChecked] = useState(false);

  const hasCw = cwEnabled && cw.trim() !== '';
  const hasImages = uploaded.length > 0;
  const sensitive = hasImages && (sensitiveChecked || hasCw);
  const notice = blueskyCrosspostNotice(destination, cwEnabled ? cw : '', sensitive, visibility);

  const handleContentChange = (value: string) => {
    setContent(value);
    setResultMessage('');
  };

  const handleSubmit = async () => {
    if (!canSubmitPost(content, isUploading, isPosting)) return;
    setIsPosting(true);
    try {
      const result = await submitPost(
        {
          content,
          uploaded,
          destination,
          visibility,
          cw: cwEnabled ? cw : '',
          sensitive: hasImages && sensitiveChecked,
        },
        { create: createStatus, updateMedia, onDescriptionSaved: handleDescriptionSaved, onPosted },
      );
      if (result.kind === 'posted') {
        setContent('');
        setUploaded([]);
        setDestination(DEFAULT_POST_DESTINATION);
        setVisibility(DEFAULT_POST_VISIBILITY);
        setCwEnabled(false);
        setCw('');
        setSensitiveChecked(false);
        setResultMessage(postedMessage(destination, result.status.iori?.bluesky_crosspost, result.status.visibility));
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
    const newMedia: UploadedMedia[] = [];

    for (const file of Array.from(files)) {
      try {
        const media = await uploadMedia(await downscaleImageForUpload(file));
        newMedia.push({ id: media.id, url: media.url, description: '', savedDescription: '' });
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

  const handleDescriptionChange = (index: number, description: string) => {
    setUploaded((prev) => prev.map((media, i) => (i === index ? { ...media, description } : media)));
  };

  const handleDescriptionSaved = (mediaId: string, savedDescription: string) => {
    setUploaded((prev) => prev.map((media) => (media.id === mediaId ? { ...media, savedDescription } : media)));
  };

  const handleCwToggle = () => {
    if (cwEnabled) setCw('');
    setCwEnabled(!cwEnabled);
  };

  return (
    <form id={formId ?? id} onSubmit={handleFormSubmit} class='flex flex-col flex-1 min-h-0'>
      {cwEnabled && (
        <input
          type='text'
          name='spoiler_text'
          value={cw}
          onInput={(e) => setCw((e.target as HTMLInputElement).value)}
          placeholder='注意書き（CW）'
          aria-label='注意書き（CW）'
          class='mb-2 w-full px-4 py-2 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset flex-shrink-0'
        />
      )}
      <MarkdownEditor
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        placeholder="What's on your mind? (⌘+Enter to post)"
        minHeight='150px'
        name='content'
      />

      {hasImages && (
        <div class='mt-3 flex flex-col gap-2 flex-shrink-0'>
          {uploaded.map(({ id: mediaId, url, description }, index) => (
            <div key={mediaId} class='flex items-start gap-2'>
              <div class='relative group flex-shrink-0'>
                <img src={url} alt='Preview' class='w-16 h-16 object-cover rounded-xl shadow-clay-sm' />
                <button
                  type='button'
                  onClick={() => handleRemoveImage(index)}
                  class='absolute -top-1 -right-1 w-5 h-5 bg-terracotta text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-clay-sm'
                >
                  &times;
                </button>
              </div>
              <textarea
                value={description}
                onInput={(e) => handleDescriptionChange(index, (e.target as HTMLTextAreaElement).value)}
                placeholder={`画像${index + 1}の説明（ALT）`}
                aria-label={`画像${index + 1}の説明（ALT）`}
                maxlength={1500}
                rows={2}
                class='flex-1 min-w-0 px-3 py-2 text-sm rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset resize-none'
              />
            </div>
          ))}
          <label class='flex items-center gap-1 text-xs text-charcoal-light dark:text-gray-400 cursor-pointer'>
            <input
              type='checkbox'
              checked={sensitive}
              disabled={hasCw}
              onChange={(e) => setSensitiveChecked((e.target as HTMLInputElement).checked)}
            />
            画像をセンシティブにする
          </label>
        </div>
      )}
      <div class='mt-2 flex-shrink-0'>
        <PostVisibilitySelect
          value={visibility}
          onChange={setVisibility}
          name='visibility'
          id={`${formId ?? id ?? 'post-form'}-visibility`}
        />
      </div>
      <div class='mt-2 flex flex-wrap justify-end items-center gap-3 flex-shrink-0'>
        <PostDestinationSelect value={destination} onChange={setDestination} name='destination' />
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
          type='button'
          aria-pressed={cwEnabled}
          aria-label='注意書き（CW）を付ける'
          onClick={handleCwToggle}
          class={`px-2 py-1 text-xs font-medium rounded-clay border transition-colors ${
            cwEnabled
              ? 'bg-terracotta text-white border-terracotta'
              : 'text-charcoal-light dark:text-gray-400 border-warm-gray-dark dark:border-gray-600 hover:text-terracotta dark:hover:text-terracotta-light'
          }`}
        >
          CW
        </button>
        <button
          type='submit'
          disabled={isPosting}
          class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
        >
          投稿する
        </button>
      </div>
      {notice !== undefined && <p class='mt-2 text-xs text-charcoal-light dark:text-gray-400 flex-shrink-0'>{notice}
      </p>}
      {resultMessage !== '' && (
        <p role='status' class='mt-2 text-sm text-charcoal-light dark:text-gray-400 flex-shrink-0'>
          {resultMessage}
        </p>
      )}
    </form>
  );
};
