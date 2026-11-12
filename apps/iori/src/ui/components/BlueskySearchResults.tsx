import type {
  IoriBlueskyActorBody,
  IoriBlueskyTimelineItemBody,
} from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { searchBlueskyActors, searchBlueskyPosts } from '../api/mastodonClient.ts';
import { type BlueskySearchPage, type BlueskySearchState, useBlueskySearch } from '../hooks/useBlueskySearch.ts';
import { blueskySearchErrorMessage } from '../pages/searchSource.ts';
import { BlueskyActorRow } from './BlueskyActorRow.tsx';
import { BlueskyTimelineItemView } from './BlueskyTimelineItemView.tsx';

type Submitted = Readonly<{ q: string; seq: number }>;

const mutedTextClass = 'text-charcoal-light dark:text-gray-400 mb-4';

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

const BlueskySearchList = <T,>({ state, submitted, renderItem }: Readonly<{
  state: BlueskySearchState<T>;
  submitted: Submitted;
  renderItem: (item: T) => unknown;
}>) => {
  if (submitted.q === '') {
    return submitted.seq === 0 ? null : <p class={mutedTextClass}>検索語を入力してください。</p>;
  }
  if (state.kind === 'error') return <p class={mutedTextClass}>{blueskySearchErrorMessage(state.status)}</p>;
  if (state.kind !== 'ready') return <p class={mutedTextClass}>検索しています</p>;
  if (state.items.length === 0) {
    return (
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
        <p class='text-charcoal-light dark:text-gray-400'>該当する結果はありません</p>
      </div>
    );
  }
  return <div class='space-y-6 py-2'>{state.items.map(renderItem)}</div>;
};

export const BlueskyPostSearchResults = ({ submitted }: Readonly<{ submitted: Submitted }>) => {
  const state = useBlueskySearch({ query: submitted.q, seq: submitted.seq, fetchPage: fetchPostsPage, keyOf: postKey });
  return (
    <BlueskySearchList
      state={state}
      submitted={submitted}
      renderItem={(item) => <BlueskyTimelineItemView key={item.feedItemId} item={item} />}
    />
  );
};

export const BlueskyActorSearchResults = ({ submitted }: Readonly<{ submitted: Submitted }>) => {
  const state = useBlueskySearch({
    query: submitted.q,
    seq: submitted.seq,
    fetchPage: fetchActorsPage,
    keyOf: actorKey,
  });
  return (
    <BlueskySearchList
      state={state}
      submitted={submitted}
      renderItem={(actor) => <BlueskyActorRow key={actor.did} actor={actor} />}
    />
  );
};
