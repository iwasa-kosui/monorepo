import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import {
  blockBlueskyActor,
  blueskyModerationFailureMessage,
  muteBlueskyActor,
  reportBlueskyActor,
} from '../api/blueskyModerationClient.ts';
import type { ReportCategory } from '../components/ReportModal.tsx';
import { blueskyModerationNotice, withoutBlueskyActor } from './blueskyAuthorModeration.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';

const REPORTED_NOTICE_MS = 4000;

export type BlueskyModerationChange = Readonly<{ muted?: boolean; blockUri?: string | null }>;

export type UseBlueskyAuthorModerationOptions = Readonly<{
  onModerated?: (did: string, change: BlueskyModerationChange) => void;
  removeItems?: (did: string) => boolean;
  keptItemsNote?: string;
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
  notice: string | undefined;
}>;

export const useBlueskyAuthorModeration = (
  updateItems: BlueskyItemsUpdater,
  options: UseBlueskyAuthorModerationOptions = {},
): UseBlueskyAuthorModerationReturn => {
  const { onModerated, removeItems = () => true, keptItemsNote } = options;
  const inFlightRef = useRef<boolean>(false);
  const reportInFlightRef = useRef<boolean>(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [target, setTarget] = useState<IoriBlueskyTimelineItemBody | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [isReported, setIsReported] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isReported) return;
    const timer = setTimeout(() => setIsReported(false), REPORTED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [isReported]);

  useEffect(() => {
    if (notice === undefined) return;
    const timer = setTimeout(() => setNotice(undefined), REPORTED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const onMuteAuthor = useCallback(
    async (item: IoriBlueskyTimelineItemBody) => {
      if (inFlightRef.current) return;
      if (!confirm(`@${item.authorHandle} をミュートしますか？\nミュートは相手のプロフィール画面で解除できます`)) {
        return;
      }
      inFlightRef.current = true;
      try {
        await muteBlueskyActor(item.authorDid);
        const removed = removeItems(item.authorDid);
        if (removed) updateItems((items) => withoutBlueskyActor(items, item.authorDid));
        onModerated?.(item.authorDid, { muted: true });
        setNotice(blueskyModerationNotice({ action: 'mute', handle: item.authorHandle, removed, keptItemsNote }));
      } catch (cause) {
        console.error('Failed to mute:', cause);
        alert(blueskyModerationFailureMessage('mute', cause));
      } finally {
        inFlightRef.current = false;
      }
    },
    [updateItems, onModerated, removeItems, keptItemsNote],
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
        const removed = removeItems(item.authorDid);
        if (removed) updateItems((items) => withoutBlueskyActor(items, item.authorDid));
        onModerated?.(item.authorDid, { blockUri: result.blockUri });
        setNotice(blueskyModerationNotice({ action: 'block', handle: item.authorHandle, removed, keptItemsNote }));
      } catch (cause) {
        console.error('Failed to block:', cause);
        alert(blueskyModerationFailureMessage('block', cause));
      } finally {
        inFlightRef.current = false;
      }
    },
    [updateItems, onModerated, removeItems, keptItemsNote],
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
      if (target === null || reportInFlightRef.current) return;
      reportInFlightRef.current = true;
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
        reportInFlightRef.current = false;
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
    notice,
  } as const;
};
