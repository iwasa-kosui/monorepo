import type { Child } from 'hono/jsx';

import type { UploadedMedia } from './postSubmission.ts';

type AttachButtonProps = Readonly<{
  isUploading: boolean;
  disabled?: boolean;
  onChange: (e: Event) => void;
}>;

export const MediaAttachButton = ({ isUploading, disabled = false, onChange }: AttachButtonProps) => (
  <label
    class={`cursor-pointer text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors${
      disabled ? ' opacity-50 pointer-events-none' : ''
    }`}
  >
    {isUploading
      ? <span class='text-xs'>アップロード中...</span>
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
      onChange={onChange}
      disabled={isUploading || disabled}
    />
  </label>
);

type PreviewListProps = Readonly<{
  uploaded: readonly UploadedMedia[];
  disabled?: boolean;
  onRemove: (index: number) => void;
  onDescriptionChange: (index: number, description: string) => void;
  children?: Child;
}>;

export const MediaPreviewList = (
  { uploaded, disabled = false, onRemove, onDescriptionChange, children }: PreviewListProps,
) =>
  uploaded.length === 0 ? null : (
    <div class='mt-3 flex flex-col gap-2 flex-shrink-0'>
      {uploaded.map(({ id: mediaId, url, description }, index) => (
        <div key={mediaId} class='flex items-start gap-2'>
          <div class='relative group flex-shrink-0'>
            <img src={url} alt='Preview' class='w-16 h-16 object-cover rounded-xl shadow-clay-sm' />
            <button
              type='button'
              onClick={() => onRemove(index)}
              disabled={disabled}
              class='absolute -top-1 -right-1 w-5 h-5 bg-terracotta text-white rounded-full flex items-center justify-center text-xs md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity shadow-clay-sm'
            >
              &times;
            </button>
          </div>
          <textarea
            value={description}
            onInput={(e) => onDescriptionChange(index, (e.target as HTMLTextAreaElement).value)}
            placeholder={`画像${index + 1}の説明（ALT）`}
            aria-label={`画像${index + 1}の説明（ALT）`}
            maxlength={1500}
            rows={2}
            disabled={disabled}
            class='flex-1 min-w-0 px-3 py-2 text-sm rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset resize-none'
          />
        </div>
      ))}
      {children}
    </div>
  );
