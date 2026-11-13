import { useEffect } from 'hono/jsx';

import type { UseReplyDialogReturn } from '../hooks/useReplyDialog.ts';
import { blueskyCrosspostNotice } from './blueskyCrosspostMark.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { PostDestinationSelect } from './PostDestinationSelect.tsx';
import { PostVisibilitySelect } from './PostVisibilitySelect.tsx';
import { ReplyDialogShell } from './ReplyDialogShell.tsx';

type Props = Readonly<{
  dialog: UseReplyDialogReturn;
}>;

export const shouldCloseReplyModalOnKey = (key: string, isSending: boolean): boolean => key === 'Escape' && !isSending;

export const FediverseReplyModal = ({ dialog }: Props) => {
  const {
    replyingToPostId,
    replyingToUsername,
    replyContent,
    replyDestination,
    replyVisibility,
    replyParentVisibility,
    isSendingReply,
    closeReplyDialog,
    setReplyContent,
    setReplyDestination,
    setReplyVisibility,
    sendReply,
  } = dialog;

  useEffect(() => {
    if (!replyingToPostId) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (shouldCloseReplyModalOnKey(e.key, isSendingReply)) {
        closeReplyDialog();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [replyingToPostId, isSendingReply, closeReplyDialog]);

  if (!replyingToPostId) {
    return null;
  }

  const submit = () => {
    if (replyContent.trim()) {
      sendReply(replyingToPostId, replyContent);
    }
  };

  const isParentDirect = replyParentVisibility === 'direct';
  const crosspostNotice = isParentDirect
    ? undefined
    : blueskyCrosspostNotice(replyDestination, '', false, replyVisibility);

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <ReplyDialogShell
      title={replyingToUsername ? `@${replyingToUsername} に返信` : undefined}
      onClose={closeReplyDialog}
      onSubmit={submit}
      isSending={isSendingReply}
      canSubmit={!isSendingReply && replyContent.trim() !== ''}
      leadingActions={
        <PostDestinationSelect value={replyDestination} onChange={setReplyDestination} name='reply-destination' />
      }
    >
      <MarkdownEditor
        value={replyContent}
        onChange={setReplyContent}
        onKeyDown={handleKeyDown}
        placeholder='返信を書く... (⌘+Enter to post)'
        minHeight='150px'
        disabled={isSendingReply}
      />
      <div class='mt-2 flex-shrink-0'>
        {isParentDirect
          ? (
            <p class='text-xs text-charcoal-light dark:text-gray-400'>
              返信先がダイレクトなので、返信もダイレクトになります
            </p>
          )
          : (
            <PostVisibilitySelect
              value={replyVisibility}
              onChange={setReplyVisibility}
              name='reply-visibility'
              id='reply-visibility'
              disabled={isSendingReply}
              maxVisibility={replyParentVisibility}
            />
          )}
      </div>
      {crosspostNotice !== undefined && (
        <p class='mt-2 text-xs text-charcoal-light dark:text-gray-400 flex-shrink-0'>{crosspostNotice}</p>
      )}
    </ReplyDialogShell>
  );
};
