import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';

type BlueskyItems = readonly IoriBlueskyTimelineItemBody[];

export const withoutBlueskyActor = (items: BlueskyItems, did: string): BlueskyItems => {
  const kept = items.filter((item) => item.authorDid !== did && item.repostedByDid !== did);
  return kept.length === items.length ? items : kept;
};

export const blueskyModerationNotice = (
  { action, handle, removed, keptItemsNote }: Readonly<{
    action: 'mute' | 'block';
    handle: string;
    removed: boolean;
    keptItemsNote?: string | undefined;
  }>,
): string => {
  const base = `@${handle} を${action === 'mute' ? 'ミュート' : 'ブロック'}しました`;
  return !removed && keptItemsNote !== undefined ? `${base}。${keptItemsNote}` : base;
};
