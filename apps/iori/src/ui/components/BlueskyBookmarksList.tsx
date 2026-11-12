import { blueskyBookmarksLoadErrorMessage } from '../api/blueskyBookmarkClient.ts';
import { useBlueskyBookmarksList } from '../hooks/useBlueskyBookmarksList.ts';
import { useBlueskyUriActions } from '../hooks/useBlueskyUriActions.ts';
import { blueskyItemActionProps } from './blueskyPostActions.ts';
import { BlueskyReplyModal } from './BlueskyReplyModal.tsx';
import { BlueskyReportPostModal } from './BlueskyReportPostModal.tsx';
import { BlueskyTimelineItemView } from './BlueskyTimelineItemView.tsx';

const mutedTextClass = 'text-charcoal-light dark:text-gray-400 mb-4';
const retryButtonClass =
  'rounded-clay bg-terracotta text-white px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';

const EMPTY_MESSAGE = 'Bluesky でブックマークした投稿はまだありません';

export const BlueskyBookmarksList = () => {
  const { state, reload, retryLoadMore, updateItems } = useBlueskyBookmarksList();
  const { actions, replyDialog, reportDialog, notice } = useBlueskyUriActions(updateItems);

  if (state.kind === 'loading') return <p class={mutedTextClass}>読み込んでいます</p>;
  if (state.kind === 'error') {
    return (
      <div class='space-y-3'>
        <p class={mutedTextClass}>{blueskyBookmarksLoadErrorMessage(state.error)}</p>
        <button type='button' class={retryButtonClass} onClick={reload}>もう一度読み込む</button>
      </div>
    );
  }
  return (
    <>
      {state.items.length === 0
        ? (
          <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
            <p class='text-charcoal-light dark:text-gray-400'>{EMPTY_MESSAGE}</p>
          </div>
        )
        : (
          <div class='space-y-6 py-2'>
            {state.items.map((item) => (
              <BlueskyTimelineItemView key={item.feedItemId} item={item} {...blueskyItemActionProps(actions, item)} />
            ))}
          </div>
        )}
      {state.loadMoreFailure !== undefined && (
        <div class='py-4 space-y-3'>
          <p class='text-charcoal-light dark:text-gray-400'>
            {blueskyBookmarksLoadErrorMessage(state.loadMoreFailure.error)}
          </p>
          <button type='button' class={retryButtonClass} disabled={state.isLoadingMore} onClick={retryLoadMore}>
            もう一度読み込む
          </button>
        </div>
      )}
      <BlueskyReplyModal dialog={replyDialog} />
      <BlueskyReportPostModal reportDialog={reportDialog} {...(notice === undefined ? {} : { notice })} />
    </>
  );
};
