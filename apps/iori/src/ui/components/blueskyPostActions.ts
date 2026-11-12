import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';

export type BlueskyPostActions = Readonly<{
  onReply: (item: IoriBlueskyTimelineItemBody) => void;
  onLike: (item: IoriBlueskyTimelineItemBody) => void;
  onUndoLike: (item: IoriBlueskyTimelineItemBody) => void;
  likePendingUris: ReadonlySet<string>;
  onRepost: (item: IoriBlueskyTimelineItemBody) => void;
  onUndoRepost: (item: IoriBlueskyTimelineItemBody) => void;
  repostPendingUris: ReadonlySet<string>;
}>;

export const blueskyItemActionProps = (actions: BlueskyPostActions | undefined, item: IoriBlueskyTimelineItemBody) =>
  actions === undefined ? {} : {
    onReply: actions.onReply,
    onLike: actions.onLike,
    onUndoLike: actions.onUndoLike,
    isLikePending: actions.likePendingUris.has(item.uri),
    onRepost: actions.onRepost,
    onUndoRepost: actions.onUndoRepost,
    isRepostPending: actions.repostPendingUris.has(item.uri),
  };
