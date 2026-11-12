import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';

type BlueskyItems = readonly IoriBlueskyTimelineItemBody[];

export const withoutBlueskyActor = (items: BlueskyItems, did: string): BlueskyItems => {
  const kept = items.filter((item) => item.authorDid !== did && item.repostedByDid !== did);
  return kept.length === items.length ? items : kept;
};
