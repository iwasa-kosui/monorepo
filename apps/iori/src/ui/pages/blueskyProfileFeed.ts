import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';

export const withFeedItems = <F extends Readonly<{ items: readonly IoriBlueskyTimelineItemBody[] }>>(
  feed: F | null,
  updater: (items: readonly IoriBlueskyTimelineItemBody[]) => readonly IoriBlueskyTimelineItemBody[],
): F | null => {
  if (feed === null) return feed;
  const items = updater(feed.items);
  return items === feed.items ? feed : { ...feed, items };
};
