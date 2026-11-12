import { useCallback, useRef, useState } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { fetchStatusSource, updateStatus } from '../api/mastodonClient.ts';
import { editParams } from '../components/postSubmission.ts';
import {
  canSendEdit,
  editErrorMessage,
  editLoadErrorMessage,
  type EditLoadState,
  hasEditableImages,
  initialEditValue,
} from './editDialog.ts';

export type UseEditDialogReturn = Readonly<{
  target: Status | null;
  loadState: EditLoadState;
  content: string;
  cw: string;
  sensitive: boolean;
  isSending: boolean;
  errorText: string | undefined;
  open: (post: Status) => void;
  close: () => void;
  setContent: (content: string) => void;
  setCw: (cw: string) => void;
  setSensitive: (sensitive: boolean) => void;
  send: () => Promise<boolean>;
}>;

type UseEditDialogProps = Readonly<{
  onEdited?: (updated: Status) => void;
}>;

export const useEditDialog = ({ onEdited }: UseEditDialogProps = {}): UseEditDialogReturn => {
  const [target, setTarget] = useState<Status | null>(null);
  const [loadState, setLoadState] = useState<EditLoadState>('loading');
  const [content, setContent] = useState('');
  const [cw, setCw] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const sendingRef = useRef(false);
  const openedIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    openedIdRef.current = null;
    setTarget(null);
    setContent('');
    setCw('');
    setSensitive(false);
    setErrorText(undefined);
  }, []);

  const open = useCallback((post: Status) => {
    if (sendingRef.current) return;
    openedIdRef.current = post.id;
    setTarget(post);
    setLoadState('loading');
    setContent('');
    setCw('');
    setSensitive(post.sensitive);
    setErrorText(undefined);
    void fetchStatusSource(post.id).then(
      (source) => {
        if (openedIdRef.current !== post.id) return;
        const value = initialEditValue(source, post);
        setContent(value.content);
        setCw(value.cw);
        setSensitive(value.sensitive);
        setLoadState('loaded');
      },
      (error: unknown) => {
        if (openedIdRef.current !== post.id) return;
        console.error('Failed to load the status source:', error);
        setErrorText(editLoadErrorMessage(error));
        setLoadState('failed');
      },
    );
  }, []);

  const close = useCallback(() => {
    if (sendingRef.current) return;
    reset();
  }, [reset]);

  const send = useCallback(async (): Promise<boolean> => {
    if (target === null || sendingRef.current) return false;
    const hasImages = hasEditableImages(target);
    if (!canSendEdit(content, hasImages, loadState, false)) return false;
    sendingRef.current = true;
    setIsSending(true);
    setErrorText(undefined);
    try {
      const updated = await updateStatus(target.id, editParams({ content, cw, sensitive }, hasImages));
      reset();
      onEdited?.(updated);
      return true;
    } catch (error) {
      console.error('Failed to edit post:', error);
      setErrorText(editErrorMessage(error));
      return false;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }, [target, content, cw, sensitive, loadState, onEdited, reset]);

  return {
    target,
    loadState,
    content,
    cw,
    sensitive,
    isSending,
    errorText,
    open,
    close,
    setContent,
    setCw,
    setSensitive,
    send,
  } as const;
};
