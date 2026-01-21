import { hc } from 'hono/client';
import { useCallback, useState } from 'hono/jsx';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';

const client = hc<APIRouterType>('/api');

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
        const res = await client.v1.reply.$post({
          json: { postId, content },
        });
        const result = await res.json();
        if ('success' in result && result.success) {
          setReplyingToPostId(null);
          setReplyContent('');
          onReplySent?.();
          return true;
        }
        if ('error' in result) {
          console.error('Failed to send reply:', result.error);
          alert(`Failed to send reply: ${result.error}`);
        }
        return false;
      } catch (error) {
        console.error('Failed to send reply:', error);
        alert('Failed to send reply. Please try again.');
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
