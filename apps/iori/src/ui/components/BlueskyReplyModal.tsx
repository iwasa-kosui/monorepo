import { blueskyReplyExcerpt, blueskyReplyRemaining, canSendBlueskyReply } from '../hooks/blueskyReply.ts';
import type { UseBlueskyReplyDialogReturn } from '../hooks/useBlueskyReplyDialog.ts';
import { ReplyDialogShell } from './ReplyDialogShell.tsx';

export const BlueskyReplyModal = ({ dialog }: Readonly<{ dialog: UseBlueskyReplyDialogReturn }>) => {
  const { target, content, isSending, errorText, close, setContent, send } = dialog;

  if (target === null) {
    return null;
  }

  const remaining = blueskyReplyRemaining(content);
  const canSubmit = canSendBlueskyReply(content, isSending);

  return (
    <ReplyDialogShell
      onClose={close}
      onSubmit={() => void send()}
      isSending={isSending}
      canSubmit={canSubmit}
      errorText={errorText}
      target={
        <div class='mb-3 rounded-xl border border-warm-gray dark:border-gray-700 p-3 text-sm'>
          <div class='flex flex-wrap items-baseline gap-x-2'>
            <span class='font-semibold text-charcoal dark:text-white'>
              {target.authorDisplayName ?? target.authorHandle}
            </span>
            <span class='text-charcoal-light dark:text-gray-400'>@{target.authorHandle}</span>
          </div>
          <p class='mt-1 whitespace-pre-wrap break-words text-charcoal-light dark:text-gray-400'>
            {blueskyReplyExcerpt(target.text)}
          </p>
        </div>
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
        placeholder='返信を書く... (⌘+Enter to post)'
        disabled={isSending}
        class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset resize-none transition-all'
        style={{ minHeight: '150px' }}
      />
    </ReplyDialogShell>
  );
};
