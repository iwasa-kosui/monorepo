import { useCallback, useRef, useState } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { canSendBlueskyReply } from './blueskyReply.ts';

export type UseBlueskyPostDialogReturn = Readonly<{
  target: IoriBlueskyTimelineItemBody | null;
  content: string;
  isSending: boolean;
  errorText: string | undefined;
  open: (item: IoriBlueskyTimelineItemBody) => void;
  close: () => void;
  setContent: (content: string) => void;
  send: () => Promise<boolean>;
}>;

type Options = Readonly<{
  submit: (target: IoriBlueskyTimelineItemBody, content: string) => Promise<unknown>;
  errorMessage: (error: unknown) => string;
  failureLog: string;
}>;

export const useBlueskyPostDialog = ({ submit, errorMessage, failureLog }: Options): UseBlueskyPostDialogReturn => {
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
      await submit(target, content);
      setTarget(null);
      setContent('');
      return true;
    } catch (error) {
      console.error(failureLog, error);
      setErrorText(errorMessage(error));
      return false;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }, [target, content, submit, errorMessage, failureLog]);

  return { target, content, isSending, errorText, open, close, setContent, send } as const;
};
