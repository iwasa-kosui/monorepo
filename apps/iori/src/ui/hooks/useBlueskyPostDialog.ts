import { useCallback, useRef, useState } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { type BlueskyInteractionParams, failureMessage, updateMedia } from '../api/mastodonClient.ts';
import {
  type BlueskyInteractionDraft,
  blueskyInteractionParamsOf,
  DEFAULT_BLUESKY_INTERACTION_DRAFT,
} from '../components/blueskyInteractionDraft.ts';
import { saveMediaDescriptions } from '../components/postSubmission.ts';
import { BLUESKY_MAX_IMAGES, canSendBlueskyPost } from './blueskyReply.ts';
import { useMediaAttachments, type UseMediaAttachmentsReturn } from './useMediaAttachments.ts';

export type UseBlueskyPostDialogReturn = Readonly<{
  target: IoriBlueskyTimelineItemBody | null;
  content: string;
  media: UseMediaAttachmentsReturn;
  interaction: BlueskyInteractionDraft;
  interactionEnabled: boolean;
  isSending: boolean;
  errorText: string | undefined;
  open: (item: IoriBlueskyTimelineItemBody) => void;
  close: () => void;
  setContent: (content: string) => void;
  setInteraction: (interaction: BlueskyInteractionDraft) => void;
  send: () => Promise<boolean>;
}>;

type Options = Readonly<{
  submit: (
    target: IoriBlueskyTimelineItemBody,
    content: string,
    mediaIds: readonly string[],
    interaction?: BlueskyInteractionParams,
  ) => Promise<unknown>;
  interactionEnabled?: boolean;
  errorMessage: (error: unknown) => string;
  failureLog: string;
}>;

export const useBlueskyPostDialog = (
  { submit, interactionEnabled = false, errorMessage, failureLog }: Options,
): UseBlueskyPostDialogReturn => {
  const [target, setTarget] = useState<IoriBlueskyTimelineItemBody | null>(null);
  const [content, setContent] = useState('');
  const [interaction, setInteraction] = useState<BlueskyInteractionDraft>(DEFAULT_BLUESKY_INTERACTION_DRAFT);
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const media = useMediaAttachments(BLUESKY_MAX_IMAGES);
  const { clear: clearMedia } = media;
  const sendingRef = useRef(false);

  const open = useCallback((item: IoriBlueskyTimelineItemBody) => {
    if (sendingRef.current) return;
    setTarget(item);
    setContent('');
    setInteraction(DEFAULT_BLUESKY_INTERACTION_DRAFT);
    clearMedia();
    setErrorText(undefined);
  }, [clearMedia]);

  const close = useCallback(() => {
    if (sendingRef.current) return;
    setTarget(null);
    setContent('');
    setInteraction(DEFAULT_BLUESKY_INTERACTION_DRAFT);
    clearMedia();
    setErrorText(undefined);
  }, [clearMedia]);

  const send = useCallback(async (): Promise<boolean> => {
    const canSend = canSendBlueskyPost(content, media.uploaded.length, {
      isSending: false,
      isUploading: media.isUploading,
    });
    if (target === null || sendingRef.current || !canSend) return false;
    sendingRef.current = true;
    setIsSending(true);
    setErrorText(undefined);
    try {
      try {
        await saveMediaDescriptions(media.uploaded, {
          updateMedia,
          onDescriptionSaved: media.markDescriptionSaved,
        });
      } catch (error) {
        console.error(failureLog, error);
        setErrorText(failureMessage('save the image description', error));
        return false;
      }
      await submit(
        target,
        content,
        media.uploaded.map(({ id }) => id),
        interactionEnabled ? blueskyInteractionParamsOf(interaction) : undefined,
      );
      setTarget(null);
      setContent('');
      setInteraction(DEFAULT_BLUESKY_INTERACTION_DRAFT);
      clearMedia();
      return true;
    } catch (error) {
      console.error(failureLog, error);
      setErrorText(errorMessage(error));
      return false;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }, [target, content, interaction, interactionEnabled, media, clearMedia, submit, errorMessage, failureLog]);

  return {
    target,
    content,
    media,
    interaction,
    interactionEnabled,
    isSending,
    errorText,
    open,
    close,
    setContent,
    setInteraction,
    send,
  } as const;
};
