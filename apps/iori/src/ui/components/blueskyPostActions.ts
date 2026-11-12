import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';

export type BlueskyPostActions = Readonly<{
  onReply: (item: IoriBlueskyTimelineItemBody) => void;
  onLike: (item: IoriBlueskyTimelineItemBody) => void;
  onUndoLike: (item: IoriBlueskyTimelineItemBody) => void;
  likePendingUris: ReadonlySet<string>;
  onRepost: (item: IoriBlueskyTimelineItemBody) => void;
  onUndoRepost: (item: IoriBlueskyTimelineItemBody) => void;
  repostPendingUris: ReadonlySet<string>;
  onQuote?: (item: IoriBlueskyTimelineItemBody) => void;
  onMuteThread?: (item: IoriBlueskyTimelineItemBody) => void;
  onUnmuteThread?: (item: IoriBlueskyTimelineItemBody) => void;
  onMuteAuthor?: (item: IoriBlueskyTimelineItemBody) => void;
  onBlockAuthor?: (item: IoriBlueskyTimelineItemBody) => void;
  onReportPost?: (item: IoriBlueskyTimelineItemBody) => void;
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
    ...(actions.onQuote === undefined ? {} : { onQuote: actions.onQuote }),
    ...(actions.onMuteThread === undefined ? {} : { onMuteThread: actions.onMuteThread }),
    ...(actions.onUnmuteThread === undefined ? {} : { onUnmuteThread: actions.onUnmuteThread }),
    ...(actions.onMuteAuthor === undefined ? {} : { onMuteAuthor: actions.onMuteAuthor }),
    ...(actions.onBlockAuthor === undefined ? {} : { onBlockAuthor: actions.onBlockAuthor }),
    ...(actions.onReportPost === undefined ? {} : { onReportPost: actions.onReportPost }),
  };
