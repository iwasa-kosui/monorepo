import type {
  IoriBlueskyActorBody,
  IoriBlueskyTimelineItemBody,
} from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { searchBlueskyActors, searchBlueskyPosts } from '../api/mastodonClient.ts';
import { useBlueskyQuoteDialog } from '../hooks/useBlueskyQuoteDialog.ts';
import { type BlueskySearchPage, type BlueskySearchView, useBlueskySearch } from '../hooks/useBlueskySearch.ts';
import { useBlueskyUriActions } from '../hooks/useBlueskyUriActions.ts';
import { blueskySearchErrorMessage } from '../pages/searchSource.ts';
import { BlueskyActorRow } from './BlueskyActorRow.tsx';
import { blueskyItemActionProps, type BlueskyPostActions } from './blueskyPostActions.ts';
import { BlueskyQuoteModal, BlueskyReplyModal } from './BlueskyReplyModal.tsx';
import { BlueskyTimelineItemView } from './BlueskyTimelineItemView.tsx';

type Submitted = Readonly<{ q: string; seq: number }>;

const mutedTextClass = 'text-charcoal-light dark:text-gray-400 mb-4';
const retryButtonClass =
  'rounded-clay bg-terracotta text-white px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';

const fetchPostsPage = async (
  q: string,
  cursor: string | undefined,
): Promise<BlueskySearchPage<IoriBlueskyTimelineItemBody>> => await searchBlueskyPosts(q, cursor);

const fetchActorsPage = async (
  q: string,
  cursor: string | undefined,
): Promise<BlueskySearchPage<IoriBlueskyActorBody>> => {
  const page = await searchBlueskyActors(q, cursor);
  return { items: page.actors, cursor: page.cursor };
};

const postKey = (item: IoriBlueskyTimelineItemBody): string => item.feedItemId;
const actorKey = (actor: IoriBlueskyActorBody): string => actor.did;

const BlueskySearchList = <T,>({ view: { state, retryLoadMore }, submitted, renderItem }: Readonly<{
  view: BlueskySearchView<T>;
  submitted: Submitted;
  renderItem: (item: T) => unknown;
}>) => {
  if (submitted.q === '') {
    return submitted.seq === 0 ? null : <p class={mutedTextClass}>検索語を入力してください。</p>;
  }
  if (state.kind === 'error') {
    return <p class={mutedTextClass}>{blueskySearchErrorMessage(state.status, state.code)}</p>;
  }
  if (state.kind !== 'ready') return <p class={mutedTextClass}>検索しています</p>;
  if (state.items.length === 0) {
    return (
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
        <p class='text-charcoal-light dark:text-gray-400'>該当する結果はありません</p>
      </div>
    );
  }
  return (
    <>
      <div class='space-y-6 py-2'>{state.items.map(renderItem)}</div>
      {state.loadMoreFailure !== undefined && (
        <div class='py-4 space-y-3'>
          <p class='text-charcoal-light dark:text-gray-400'>
            {blueskySearchErrorMessage(state.loadMoreFailure.status, state.loadMoreFailure.code)}
          </p>
          <button type='button' class={retryButtonClass} disabled={state.isLoadingMore} onClick={retryLoadMore}>
            もう一度読み込む
          </button>
        </div>
      )}
    </>
  );
};

export const BlueskySearchPostItem = (
  { item, actions }: Readonly<{ item: IoriBlueskyTimelineItemBody; actions?: BlueskyPostActions }>,
) => <BlueskyTimelineItemView item={item} {...blueskyItemActionProps(actions, item)} />;

export const BlueskyPostSearchResults = ({ submitted }: Readonly<{ submitted: Submitted }>) => {
  const view = useBlueskySearch({ query: submitted.q, seq: submitted.seq, fetchPage: fetchPostsPage, keyOf: postKey });
  const { actions: uriActions, replyDialog } = useBlueskyUriActions(view.updateItems);
  const quoteDialog = useBlueskyQuoteDialog();
  const actions: BlueskyPostActions = { ...uriActions, onQuote: quoteDialog.open };
  return (
    <>
      <BlueskySearchList
        view={view}
        submitted={submitted}
        renderItem={(item) => <BlueskySearchPostItem key={item.feedItemId} item={item} actions={actions} />}
      />
      <BlueskyReplyModal dialog={replyDialog} />
      <BlueskyQuoteModal dialog={quoteDialog} />
    </>
  );
};

export const BlueskyActorSearchResults = ({ submitted }: Readonly<{ submitted: Submitted }>) => {
  const view = useBlueskySearch({
    query: submitted.q,
    seq: submitted.seq,
    fetchPage: fetchActorsPage,
    keyOf: actorKey,
  });
  return (
    <BlueskySearchList
      view={view}
      submitted={submitted}
      renderItem={(actor) => <BlueskyActorRow key={actor.did} actor={actor} />}
    />
  );
};
