import { useEffect } from 'hono/jsx';

import type { UseReplyDialogReturn } from '../hooks/useReplyDialog.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { PostDestinationSelect } from './PostDestinationSelect.tsx';
import { ReplyDialogShell } from './ReplyDialogShell.tsx';
import { ReplyTargetCard } from './ReplyTargetCard.tsx';
import { ReplyVisibilityControl } from './ReplyVisibilityField.tsx';

type Props = Readonly<{
  dialog: UseReplyDialogReturn;
}>;

export const shouldCloseReplyModalOnKey = (key: string, isSending: boolean): boolean => key === 'Escape' && !isSending;

export const FediverseReplyModal = ({ dialog }: Props) => {
  const {
    replyingToPostId,
    replyingToUsername,
    replyingToStatus,
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
      target={replyingToStatus === null ? undefined : <ReplyTargetCard status={replyingToStatus} />}
      leadingActions={
        <>
          <ReplyVisibilityControl
            value={replyVisibility}
            onChange={setReplyVisibility}
            parentVisibility={replyParentVisibility}
            disabled={isSendingReply}
            name='reply-visibility'
            id='reply-visibility'
          />
          <PostDestinationSelect
            value={replyDestination}
            onChange={setReplyDestination}
            name='reply-destination'
            disabled={isSendingReply}
          />
        </>
      }
    >
      <MarkdownEditor
        value={replyContent}
        onChange={setReplyContent}
        onKeyDown={handleKeyDown}
        placeholder='返信を書く（⌘+Enter で送信）'
        minHeight='150px'
        disabled={isSendingReply}
      />
    </ReplyDialogShell>
  );
};
