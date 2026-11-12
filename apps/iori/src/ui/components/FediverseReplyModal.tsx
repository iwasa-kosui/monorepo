import type { UseReplyDialogReturn } from '../hooks/useReplyDialog.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { PostDestinationSelect } from './PostDestinationSelect.tsx';
import { ReplyDialogShell } from './ReplyDialogShell.tsx';

type Props = Readonly<{
  dialog: UseReplyDialogReturn;
}>;

export const FediverseReplyModal = ({ dialog }: Props) => {
  const {
    replyingToPostId,
    replyContent,
    replyDestination,
    isSendingReply,
    closeReplyDialog,
    setReplyContent,
    setReplyDestination,
    sendReply,
  } = dialog;

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
    </ReplyDialogShell>
  );
};
