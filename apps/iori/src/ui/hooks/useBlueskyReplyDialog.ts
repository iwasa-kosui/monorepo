import { useCallback, useRef, useState } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { type BlueskyReplyResponse, replyToBlueskyPost, replyToBlueskyPostByUri } from '../api/mastodonClient.ts';
import { blueskyReplyErrorMessage, canSendBlueskyReply } from './blueskyReply.ts';

export type UseBlueskyReplyDialogReturn = Readonly<{
  target: IoriBlueskyTimelineItemBody | null;
  content: string;
  isSending: boolean;
  errorText: string | undefined;
  open: (item: IoriBlueskyTimelineItemBody) => void;
  close: () => void;
  setContent: (content: string) => void;
  send: () => Promise<boolean>;
}>;

export type BlueskyReplySender = (item: IoriBlueskyTimelineItemBody, text: string) => Promise<BlueskyReplyResponse>;

const sendByFeedItemId: BlueskyReplySender = (item, text) => replyToBlueskyPost(item.feedItemId, text);

export const sendBlueskyReplyByUri: BlueskyReplySender = (item, text) => replyToBlueskyPostByUri(item.uri, text);

export const useBlueskyReplyDialog = (
  sendReply: BlueskyReplySender = sendByFeedItemId,
): UseBlueskyReplyDialogReturn => {
  const [target, setTarget] = useState<IoriBlueskyTimelineItemBody | null>(null);
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const sendingRef = useRef(false);

  const open = useCallback((item: IoriBlueskyTimelineItemBody) => {
    if (sendingRef.current) return;
    setTarget(item);
    setContent('');
    setErrorText(undefined);
  }, []);

  const close = useCallback(() => {
    if (sendingRef.current) return;
    setTarget(null);
    setContent('');
    setErrorText(undefined);
  }, []);

  const send = useCallback(async (): Promise<boolean> => {
    if (target === null || sendingRef.current || !canSendBlueskyReply(content, false)) return false;
    sendingRef.current = true;
    setIsSending(true);
    setErrorText(undefined);
    try {
      await sendReply(target, content);
      setTarget(null);
      setContent('');
      return true;
    } catch (error) {
      console.error('Failed to reply to Bluesky post:', error);
      setErrorText(blueskyReplyErrorMessage(error));
      return false;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }, [target, content, sendReply]);

  return { target, content, isSending, errorText, open, close, setContent, send } as const;
};
