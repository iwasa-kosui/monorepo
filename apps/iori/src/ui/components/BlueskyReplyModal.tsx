import { blueskyReplyExcerpt, blueskyReplyRemaining, canSendBlueskyPost } from '../hooks/blueskyReply.ts';
import type { UseBlueskyPostDialogReturn } from '../hooks/useBlueskyPostDialog.ts';
import { MediaAttachButton, MediaPreviewList } from './MediaAttachments.tsx';
import { ReplyDialogShell } from './ReplyDialogShell.tsx';

type Props = Readonly<{
  dialog: UseBlueskyPostDialogReturn;
  title?: string;
  submitLabel?: string;
  placeholder?: string;
}>;

export const BlueskyReplyModal = (
  { dialog, title, submitLabel, placeholder = '返信を書く... (⌘+Enter to post)' }: Props,
) => {
  const { target, content, media, isSending, errorText, close, setContent, send } = dialog;

  if (target === null) {
    return null;
  }

  const remaining = blueskyReplyRemaining(content);
  const canSubmit = canSendBlueskyPost(content, media.uploaded.length, {
    isSending,
    isUploading: media.isUploading,
  });

  return (
    <ReplyDialogShell
      title={title}
      submitLabel={submitLabel}
      onClose={close}
      onSubmit={() => void send()}
      isSending={isSending}
      canSubmit={canSubmit}
      errorText={errorText}
      target={
        <div class='mb-3 rounded-xl border border-warm-gray dark:border-gray-700 p-3 text-sm'>
          <div class='flex flex-wrap items-baseline gap-x-2 min-w-0'>
            <span class='truncate font-semibold text-charcoal dark:text-white'>
              {target.authorDisplayName ?? target.authorHandle}
            </span>
            <span class='truncate text-charcoal-light dark:text-gray-400'>@{target.authorHandle}</span>
          </div>
          <p class='mt-1 whitespace-pre-wrap break-words text-charcoal-light dark:text-gray-400'>
            {blueskyReplyExcerpt(target.text)}
          </p>
        </div>
      }
      leadingActions={
        <MediaAttachButton
          isUploading={media.isUploading}
          disabled={isSending || media.slotsLeft === 0}
          onChange={media.select}
        />
      }
      counter={
        <span
          class={`mr-auto self-center text-sm ${
            remaining < 0 ? 'text-terracotta font-medium' : 'text-charcoal-light dark:text-gray-400'
          }`}
        >
          {remaining}
        </span>
      }
    >
      <textarea
        value={content}
        onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (canSubmit) void send();
          }
        }}
        placeholder={placeholder}
        disabled={isSending}
        class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset resize-none transition-all'
        style={{ minHeight: '150px' }}
      />
      <div class='min-h-0 overflow-y-auto'>
        <MediaPreviewList
          uploaded={media.uploaded}
          disabled={isSending}
          onRemove={media.remove}
          onDescriptionChange={media.setDescription}
        />
        {media.notice !== null && <p role='status' class='mt-2 text-sm text-terracotta'>{media.notice}</p>}
      </div>
    </ReplyDialogShell>
  );
};

export const BlueskyQuoteModal = ({ dialog }: Readonly<{ dialog: UseBlueskyPostDialogReturn }>) => (
  <BlueskyReplyModal
    dialog={dialog}
    title='引用'
    submitLabel='引用して投稿'
    placeholder='引用にコメントを書く... (⌘+Enter to post)'
  />
);
