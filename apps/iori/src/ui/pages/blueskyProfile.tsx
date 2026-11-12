import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyProfileUrlOfActor } from '../../helper/blueskyUrl.ts';
import {
  blueskyActorOfPath,
  blueskyFeedNoticeMessage,
  blueskyFollowFailureMessage,
  type BlueskyProfile,
  blueskyProfileLoadFailureMessage,
  fetchBlueskyAuthorFeed,
  fetchBlueskyProfile,
  followBlueskyActor,
  unfollowBlueskyActor,
} from '../api/blueskyProfileClient.ts';
import { blueskyItemActionProps, type BlueskyPostActions } from '../components/blueskyPostActions.ts';
import { BlueskyReplyModal } from '../components/BlueskyReplyModal.tsx';
import { BlueskyTimelineItemView } from '../components/BlueskyTimelineItemView.tsx';
import { appendUniqueBy } from '../hooks/appendUnique.ts';
import type { BlueskyItemsUpdater } from '../hooks/optimisticBlueskyLike.ts';
import { useBlueskyUriActions } from '../hooks/useBlueskyUriActions.ts';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';
import { withFeedItems } from './blueskyProfileFeed.ts';

type Props = Readonly<{
  profile: BlueskyProfile;
  items: readonly IoriBlueskyTimelineItemBody[];
  feedNotice: string | null;
  isFeedLoading: boolean;
  isFollowing: boolean;
  isTogglingFollow: boolean;
  onFollow: () => Promise<void>;
  onUnfollow: () => Promise<void>;
  actions?: BlueskyPostActions;
}>;

export const BlueskyProfilePage = (
  { profile, items, feedNotice, isFeedLoading, isFollowing, isTogglingFollow, onFollow, onUnfollow, actions }: Props,
) => {
  const displayName = profile.displayName ?? profile.handle;
  const profileUrl = blueskyProfileUrlOfActor(profile.did);

  return (
    <>
      <section class='mb-8'>
        <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover blob-bg'>
          {profile.banner !== null && (
            <img
              src={profile.banner}
              alt='ヘッダー画像'
              class='w-full h-32 object-cover rounded-xl mb-4 relative z-10'
            />
          )}
          <div class='flex items-center gap-4 mb-4 relative z-10'>
            <div class='w-16 h-16 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-clay-sm'>
              {profile.avatar !== null
                ? <img src={profile.avatar} alt='User Logo' class='w-16 h-16 blob-avatar object-cover' />
                : displayName.charAt(0).toUpperCase()}
            </div>
            <div class='flex-1 min-w-0'>
              <h1 class='text-2xl font-bold text-charcoal dark:text-white truncate'>{displayName}</h1>
              <p class='text-charcoal-light dark:text-gray-400 truncate'>@{profile.handle}</p>
              {profile.followedBy && (
                <p class='mt-1 flex items-center gap-2 text-xs'>
                  <span class='rounded-full bg-sand-light dark:bg-gray-700 px-2 py-0.5 text-charcoal-light dark:text-gray-300'>
                    フォローされています
                  </span>
                </p>
              )}
            </div>
          </div>

          {profile.description !== null && (
            <p
              data-testid='bluesky-profile-description'
              class='mb-4 relative z-10 whitespace-pre-wrap break-words text-charcoal dark:text-gray-200'
            >
              {profile.description}
            </p>
          )}

          <p class='mb-4 relative z-10 flex flex-wrap gap-x-4 text-sm text-charcoal-light dark:text-gray-400'>
            <span>フォロー {profile.followsCount}</span>
            <span>フォロワー {profile.followersCount}</span>
            <span>投稿 {profile.postsCount}</span>
          </p>

          <div class='flex items-center gap-3'>
            {isFollowing
              ? (
                <button
                  type='button'
                  onClick={onUnfollow}
                  disabled={isTogglingFollow}
                  class='flex items-center justify-center p-2 rounded-xl text-sage-dark dark:text-sage hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
                  title='フォロー解除'
                >
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    class='h-5 w-5'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                    stroke-width='2'
                  >
                    <path
                      stroke-linecap='round'
                      stroke-linejoin='round'
                      d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                    />
                    <path stroke-linecap='round' stroke-linejoin='round' d='M15 11l2 2 4-4' />
                  </svg>
                </button>
              )
              : (
                <button
                  type='button'
                  onClick={onFollow}
                  disabled={isTogglingFollow}
                  class='flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-sage-dark dark:hover:text-sage hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
                  title='フォロー'
                >
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    class='h-5 w-5'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                    stroke-width='2'
                  >
                    <path
                      stroke-linecap='round'
                      stroke-linejoin='round'
                      d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                    />
                    <path stroke-linecap='round' stroke-linejoin='round' d='M19 10h-2m-2 0h2m0 0V8m0 2v2' />
                  </svg>
                </button>
              )}
            {profileUrl !== undefined && (
              <a
                href={profileUrl}
                target='_blank'
                rel='noopener noreferrer'
                class='flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
                title='Bluesky で開く'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  class='h-5 w-5'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  stroke-width='2'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
                  />
                </svg>
              </a>
            )}
          </div>
        </div>
      </section>

      <section class='space-y-6 py-2'>
        <h2 class='text-xl font-bold text-charcoal dark:text-white mb-4'>Posts</h2>
        {isFeedLoading
          ? <p class='text-charcoal-light dark:text-gray-400'>Loading...</p>
          : feedNotice !== null
          ? <p class='text-charcoal-light dark:text-gray-400'>{feedNotice}</p>
          : items.length === 0
          ? <p class='text-charcoal-light dark:text-gray-400'>No posts yet.</p>
          : items.map((item) => (
            <BlueskyTimelineItemView key={item.feedItemId} item={item} {...blueskyItemActionProps(actions, item)} />
          ))}
      </section>
    </>
  );
};

type ProfileData = Readonly<{
  profile: BlueskyProfile;
  followUri: string | null;
}>;

type FeedData = Readonly<{
  items: readonly IoriBlueskyTimelineItemBody[];
  cursor: string | undefined;
  unavailable: 'blocked' | null;
  failed: boolean;
}>;

const App = () => {
  const isFetchingMoreRef = useRef(false);
  const isTogglingFollowRef = useRef(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [data, setData] = useState<{ error: string } | ProfileData | null>(null);
  const [feed, setFeed] = useState<FeedData | null>(null);
  const actor = blueskyActorOfPath(window.location.pathname);
  const updateItems: BlueskyItemsUpdater = useCallback((updater) => {
    setFeed((prev) => withFeedItems(prev, updater));
  }, []);
  const { actions, replyDialog } = useBlueskyUriActions(updateItems);

  useEffect(() => {
    if (actor === undefined) {
      setData({ error: blueskyProfileLoadFailureMessage(undefined) });
      return;
    }
    const fetchProfile = async () => {
      try {
        const profile = await fetchBlueskyProfile(actor);
        setData({ profile, followUri: profile.followUri });
      } catch (error) {
        console.error('Failed to load Bluesky profile:', error);
        setData({ error: blueskyProfileLoadFailureMessage(error) });
      }
    };
    const fetchFirstPage = async () => {
      try {
        const page = await fetchBlueskyAuthorFeed(actor);
        setFeed({ items: page.items, cursor: page.cursor ?? undefined, unavailable: page.unavailable, failed: false });
      } catch (error) {
        console.error('Failed to load Bluesky posts:', error);
        setFeed({ items: [], cursor: undefined, unavailable: null, failed: true });
      }
    };
    fetchProfile();
    fetchFirstPage();
  }, [actor]);

  const loaded = data !== null && !('error' in data) ? data : undefined;

  const loadMore = useCallback(async (cursor: string) => {
    if (actor === undefined || isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;
    try {
      const page = await fetchBlueskyAuthorFeed(actor, cursor);
      const next = page.items.length === 0 || page.cursor === cursor ? undefined : page.cursor ?? undefined;
      setFeed((prev) =>
        prev === null
          ? prev
          : { ...prev, items: appendUniqueBy(prev.items, page.items, (item) => item.feedItemId), cursor: next }
      );
    } catch (error) {
      console.error('Failed to load more posts:', error);
    } finally {
      isFetchingMoreRef.current = false;
    }
  }, [actor]);

  useInfiniteScroll({ nextCursor: feed?.cursor, onLoadMore: loadMore });

  const toggleFollow = async (follow: boolean) => {
    if (loaded === undefined || isTogglingFollowRef.current) return;
    isTogglingFollowRef.current = true;
    setIsTogglingFollow(true);
    try {
      const followUri = loaded.followUri ?? undefined;
      let nextFollowUri: string | null = null;
      if (follow) {
        nextFollowUri = (await followBlueskyActor(loaded.profile.did, followUri)).followUri;
      } else {
        await unfollowBlueskyActor(loaded.profile.did, followUri);
      }
      setData((prev) => prev === null || 'error' in prev ? prev : { ...prev, followUri: nextFollowUri });
    } catch (error) {
      console.error(follow ? 'Failed to follow:' : 'Failed to unfollow:', error);
      alert(blueskyFollowFailureMessage(error));
    } finally {
      isTogglingFollowRef.current = false;
      setIsTogglingFollow(false);
    }
  };

  if (data === null) {
    return <div class='text-charcoal-light dark:text-gray-400'>Loading...</div>;
  }

  if ('error' in data) {
    return <div class='text-red-500'>{data.error}</div>;
  }

  return (
    <>
      <BlueskyProfilePage
        profile={data.profile}
        items={feed?.items ?? []}
        feedNotice={feed === null ? null : blueskyFeedNoticeMessage(feed)}
        isFeedLoading={feed === null}
        isFollowing={data.followUri !== null}
        isTogglingFollow={isTogglingFollow}
        onFollow={() => toggleFollow(true)}
        onUnfollow={() => toggleFollow(false)}
        actions={actions}
      />
      <BlueskyReplyModal dialog={replyDialog} />
    </>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
