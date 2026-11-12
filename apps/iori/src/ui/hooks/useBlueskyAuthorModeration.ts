import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import {
  blockBlueskyActor,
  blueskyModerationFailureMessage,
  muteBlueskyActor,
  reportBlueskyActor,
} from '../api/blueskyModerationClient.ts';
import type { ReportCategory } from '../components/ReportModal.tsx';
import { withoutBlueskyActor } from './blueskyAuthorModeration.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';

const REPORTED_NOTICE_MS = 4000;

export type BlueskyModerationChange = Readonly<{ muted?: boolean; blockUri?: string | null }>;

export type UseBlueskyAuthorModerationOptions = Readonly<{
  onModerated?: (did: string, change: BlueskyModerationChange) => void;
}>;

export type BlueskyReportDialog = Readonly<{
  target: IoriBlueskyTimelineItemBody | null;
  isReporting: boolean;
  isReported: boolean;
  error: string | undefined;
  open: (target: IoriBlueskyTimelineItemBody) => void;
  close: () => void;
  submit: (input: { category: ReportCategory; comment: string }) => Promise<void>;
}>;

export type UseBlueskyAuthorModerationReturn = Readonly<{
  onMuteAuthor: (item: IoriBlueskyTimelineItemBody) => Promise<void>;
  onBlockAuthor: (item: IoriBlueskyTimelineItemBody) => Promise<void>;
  onReportPost: (item: IoriBlueskyTimelineItemBody) => void;
  reportDialog: BlueskyReportDialog;
}>;

export const useBlueskyAuthorModeration = (
  updateItems: BlueskyItemsUpdater,
  options: UseBlueskyAuthorModerationOptions = {},
): UseBlueskyAuthorModerationReturn => {
  const { onModerated } = options;
  const inFlightRef = useRef<boolean>(false);
  const [target, setTarget] = useState<IoriBlueskyTimelineItemBody | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [isReported, setIsReported] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isReported) return;
    const timer = setTimeout(() => setIsReported(false), REPORTED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [isReported]);

  const onMuteAuthor = useCallback(
    async (item: IoriBlueskyTimelineItemBody) => {
      if (inFlightRef.current) return;
      if (!confirm(`@${item.authorHandle} をミュートしますか？\nミュートは相手のプロフィール画面で解除できます`)) {
        return;
      }
      inFlightRef.current = true;
      try {
        await muteBlueskyActor(item.authorDid);
        updateItems((items) => withoutBlueskyActor(items, item.authorDid));
        onModerated?.(item.authorDid, { muted: true });
      } catch (cause) {
        console.error('Failed to mute:', cause);
        alert(blueskyModerationFailureMessage('mute', cause));
      } finally {
        inFlightRef.current = false;
      }
    },
    [updateItems, onModerated],
  );

  const onBlockAuthor = useCallback(
    async (item: IoriBlueskyTimelineItemBody) => {
      if (inFlightRef.current) return;
      if (
        !confirm(
          `@${item.authorHandle} をブロックしますか？お互いの投稿が表示されなくなり、返信やメンションもできなくなります\nブロックは相手のプロフィール画面で解除できます`,
        )
      ) return;
      inFlightRef.current = true;
      try {
        const result = await blockBlueskyActor(item.authorDid);
        updateItems((items) => withoutBlueskyActor(items, item.authorDid));
        onModerated?.(item.authorDid, { blockUri: result.blockUri });
      } catch (cause) {
        console.error('Failed to block:', cause);
        alert(blueskyModerationFailureMessage('block', cause));
      } finally {
        inFlightRef.current = false;
      }
    },
    [updateItems, onModerated],
  );

  const open = useCallback((next: IoriBlueskyTimelineItemBody) => {
    setError(undefined);
    setTarget(next);
  }, []);

  const close = useCallback(() => {
    if (isReporting) return;
    setTarget(null);
    setError(undefined);
  }, [isReporting]);

  const submit = useCallback(
    async (input: { category: ReportCategory; comment: string }) => {
      if (target === null) return;
      setIsReporting(true);
      setError(undefined);
      try {
        await reportBlueskyActor({
          did: target.authorDid,
          uri: target.uri,
          cid: target.cid,
          category: input.category,
          comment: input.comment,
        });
        setTarget(null);
        setIsReported(true);
      } catch (cause) {
        console.error('Failed to report:', cause);
        setError(blueskyModerationFailureMessage('report', cause));
      } finally {
        setIsReporting(false);
      }
    },
    [target],
  );

  return {
    onMuteAuthor,
    onBlockAuthor,
    onReportPost: open,
    reportDialog: { target, isReporting, isReported, error, open, close, submit },
  } as const;
};
