import { useCallback, useRef, useState } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import { createStatus } from '../api/mastodonClient.ts';
import { DEFAULT_POST_DESTINATION } from '../components/postDestination.ts';
import { quoteParams } from '../components/postSubmission.ts';
import { canSendQuote, quoteErrorMessage } from './quoteDialog.ts';

export type UseQuoteDialogReturn = Readonly<{
  target: Status | null;
  content: string;
  destination: PostDestination;
  isSending: boolean;
  errorText: string | undefined;
  open: (post: Status) => void;
  close: () => void;
  setContent: (content: string) => void;
  setDestination: (destination: PostDestination) => void;
  send: () => Promise<boolean>;
}>;

type UseQuoteDialogProps = Readonly<{
  onQuoted?: () => void;
}>;

export const useQuoteDialog = ({ onQuoted }: UseQuoteDialogProps = {}): UseQuoteDialogReturn => {
  const [target, setTarget] = useState<Status | null>(null);
  const [content, setContent] = useState('');
  const [destination, setDestination] = useState<PostDestination>(DEFAULT_POST_DESTINATION);
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const sendingRef = useRef(false);

  const open = useCallback((post: Status) => {
    if (sendingRef.current) return;
    setTarget(post);
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
    if (target === null || sendingRef.current || !canSendQuote(content, false)) return false;
    sendingRef.current = true;
    setIsSending(true);
    setErrorText(undefined);
    try {
      await createStatus(quoteParams(target.id, content, destination));
      setTarget(null);
      setContent('');
      setDestination(DEFAULT_POST_DESTINATION);
      onQuoted?.();
      return true;
    } catch (error) {
      console.error('Failed to quote post:', error);
      setErrorText(quoteErrorMessage(error));
      return false;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }, [target, content, destination, onQuoted]);

  return { target, content, destination, isSending, errorText, open, close, setContent, setDestination, send } as const;
};
