import { useCallback, useState } from 'hono/jsx';

import { createStatus, failureMessage } from '../api/mastodonClient.ts';

export type UseReplyDialogReturn = Readonly<{
  replyingToPostId: string | null;
  replyContent: string;
  isSendingReply: boolean;
  openReplyDialog: (postId: string) => void;
  closeReplyDialog: () => void;
  setReplyContent: (content: string) => void;
  sendReply: (postId: string, content: string) => Promise<boolean>;
}>;

type UseReplyDialogProps = Readonly<{
  onReplySent?: () => void;
}>;

export const useReplyDialog = ({
  onReplySent,
}: UseReplyDialogProps = {}): UseReplyDialogReturn => {
  const [replyingToPostId, setReplyingToPostId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const openReplyDialog = useCallback((postId: string) => {
    setReplyingToPostId(postId);
    setReplyContent('');
  }, []);

  const closeReplyDialog = useCallback(() => {
    setReplyingToPostId(null);
    setReplyContent('');
  }, []);

  const sendReply = useCallback(
    async (postId: string, content: string): Promise<boolean> => {
      setIsSendingReply(true);
      try {
        await createStatus({ status: content, in_reply_to_id: postId, content_type: 'text/markdown' });
        setReplyingToPostId(null);
        setReplyContent('');
        onReplySent?.();
        return true;
      } catch (error) {
        console.error('Failed to send reply:', error);
        alert(failureMessage('send reply', error));
        return false;
      } finally {
        setIsSendingReply(false);
      }
    },
    [onReplySent],
  );

  return {
    replyingToPostId,
    replyContent,
    isSendingReply,
    openReplyDialog,
    closeReplyDialog,
    setReplyContent,
    sendReply,
  } as const;
};
