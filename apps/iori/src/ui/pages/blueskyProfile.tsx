import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyProfileUrlOfActor } from '../../helper/blueskyUrl.ts';
import { openBlueskyChatConvo } from '../api/blueskyChatClient.ts';
import {
  blockBlueskyActor,
  blueskyModerationFailureMessage,
  fetchBlueskyModeration,
  muteBlueskyActor,
  reportBlueskyActor,
  unblockBlueskyActor,
  unmuteBlueskyActor,
} from '../api/blueskyModerationClient.ts';
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
import { BlueskyQuoteModal, BlueskyReplyModal } from '../components/BlueskyReplyModal.tsx';
import { BlueskyReportPostModal } from '../components/BlueskyReportPostModal.tsx';
import { BlueskyTimelineItemView } from '../components/BlueskyTimelineItemView.tsx';
import { type ReportCategory, ReportModal } from '../components/ReportModal.tsx';
import { appendUniqueBy } from '../hooks/appendUnique.ts';
import { chatConvoPath, chatErrorMessageOf } from '../hooks/blueskyChat.ts';
import type { BlueskyItemsUpdater } from '../hooks/optimisticBlueskyLike.ts';
import type { BlueskyModerationChange } from '../hooks/useBlueskyAuthorModeration.ts';
import { useBlueskyQuoteDialog } from '../hooks/useBlueskyQuoteDialog.ts';
import { useBlueskyUriActions } from '../hooks/useBlueskyUriActions.ts';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';
import { withFeedItems } from './blueskyProfileFeed.ts';

export type BlueskyModerationView = Readonly<{ muted: boolean; blockUri: string | null }>;

type Props = Readonly<{
  profile: BlueskyProfile;
  items: readonly IoriBlueskyTimelineItemBody[];
  feedNotice: string | null;
  isFeedLoading: boolean;
  isFollowing: boolean;
  isTogglingFollow: boolean;
  moderation: BlueskyModerationView | null;
  isTogglingMute: boolean;
  isTogglingBlock: boolean;
  isOpeningMessage: boolean;
  messageError: string | null;
  onFollow: () => Promise<void>;
  onUnfollow: () => Promise<void>;
  onMute: () => Promise<void>;
  onUnmute: () => Promise<void>;
  onBlock: () => Promise<void>;
  onUnblock: () => Promise<void>;
  onReport: () => void;
  onMessage: () => Promise<void>;
  actions?: BlueskyPostActions;
}>;

type ModerationButtonProps = Readonly<{
  title: string;
  active: boolean;
  disabled: boolean;
  onClick: () => unknown;
  paths: readonly string[];
}>;

const ModerationButton = ({ title, active, disabled, onClick, paths }: ModerationButtonProps) => (
  <button
    type='button'
    onClick={onClick}
    disabled={disabled}
    class={active
      ? 'flex items-center justify-center p-2 rounded-xl text-terracotta dark:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
      : 'flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'}
    title={title}
  >
    <svg
      xmlns='http://www.w3.org/2000/svg'
      class='h-5 w-5'
      fill='none'
      viewBox='0 0 24 24'
      stroke='currentColor'
      stroke-width='2'
    >
      {paths.map((d) => <path key={d} stroke-linecap='round' stroke-linejoin='round' d={d} />)}
    </svg>
  </button>
);

const MUTE_PATHS = [
  'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z',
  'M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2',
];
const BLOCK_PATHS = ['M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'];
const REPORT_PATHS = ['M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9'];

export const BlueskyProfilePage = (
  {
    profile,
    items,
    feedNotice,
    isFeedLoading,
    isFollowing,
    isTogglingFollow,
    moderation,
    isTogglingMute,
    isTogglingBlock,
    isOpeningMessage,
    messageError,
    onFollow,
    onUnfollow,
    onMute,
    onUnmute,
    onBlock,
    onUnblock,
    onReport,
    onMessage,
    actions,
  }: Props,
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
            {moderation !== null && (
              <>
                <ModerationButton
                  title={moderation.muted ? 'ミュート解除' : 'ミュート'}
                  active={moderation.muted}
                  disabled={isTogglingMute}
                  onClick={moderation.muted ? onUnmute : onMute}
                  paths={MUTE_PATHS}
                />
                <ModerationButton
                  title={moderation.blockUri !== null ? 'ブロック解除' : 'ブロック'}
                  active={moderation.blockUri !== null}
                  disabled={isTogglingBlock}
                  onClick={moderation.blockUri !== null ? onUnblock : onBlock}
                  paths={BLOCK_PATHS}
                />
                <ModerationButton
                  title='通報'
                  active={false}
                  disabled={false}
                  onClick={onReport}
                  paths={REPORT_PATHS}
                />
              </>
            )}
            {!profile.isSelf && (
              <button
                type='button'
                onClick={onMessage}
                disabled={isOpeningMessage}
                class='flex items-center justify-center gap-1 p-2 rounded-xl text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
                title='メッセージ'
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
                    d='M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
                  />
                </svg>
                メッセージ
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
          {messageError !== null && (
            <p role='alert' class='mt-3 text-sm text-red-600 dark:text-red-400'>{messageError}</p>
          )}
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
  moderation: BlueskyModerationView | null;
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
  const isOpeningMessageRef = useRef(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const isTogglingMuteRef = useRef(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const isTogglingBlockRef = useRef(false);
  const [isTogglingBlock, setIsTogglingBlock] = useState(false);
  const isReportingRef = useRef(false);
  const [isReporting, setIsReporting] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportError, setReportError] = useState<string | undefined>(undefined);
  const [isOpeningMessage, setIsOpeningMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [data, setData] = useState<{ error: string } | ProfileData | null>(null);
  const [feed, setFeed] = useState<FeedData | null>(null);
  const actor = blueskyActorOfPath(window.location.pathname);
  const updateItems: BlueskyItemsUpdater = useCallback((updater) => {
    setFeed((prev) => withFeedItems(prev, updater));
  }, []);
  const onModerated = useCallback((did: string, change: BlueskyModerationChange) => {
    setData((prev) =>
      prev === null || 'error' in prev || prev.moderation === null || prev.profile.did !== did
        ? prev
        : {
          ...prev,
          moderation: {
            muted: change.muted ?? prev.moderation.muted,
            blockUri: change.blockUri === undefined ? prev.moderation.blockUri : change.blockUri,
          },
        }
    );
  }, []);
  const { actions: uriActions, replyDialog, reportDialog } = useBlueskyUriActions(updateItems, { onModerated });
  const quoteDialog = useBlueskyQuoteDialog();
  const actions: BlueskyPostActions = { ...uriActions, onQuote: quoteDialog.open };

  useEffect(() => {
    if (actor === undefined) {
      setData({ error: blueskyProfileLoadFailureMessage(undefined) });
      return;
    }
    const fetchProfile = async () => {
      try {
        const profile = await fetchBlueskyProfile(actor);
        setData({ profile, followUri: profile.followUri, moderation: null });
        try {
          const moderation = await fetchBlueskyModeration(profile.did);
          setData((prev) => prev === null || 'error' in prev ? prev : { ...prev, moderation });
        } catch (error) {
          console.error('Failed to load Bluesky moderation state:', error);
        }
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

  const toggleMute = async (mute: boolean) => {
    if (loaded === undefined || isTogglingMuteRef.current) return;
    isTogglingMuteRef.current = true;
    setIsTogglingMute(true);
    try {
      const result = mute ? await muteBlueskyActor(loaded.profile.did) : await unmuteBlueskyActor(loaded.profile.did);
      setData((prev) =>
        prev === null || 'error' in prev || prev.moderation === null
          ? prev
          : { ...prev, moderation: { ...prev.moderation, muted: result.muted } }
      );
    } catch (error) {
      console.error(mute ? 'Failed to mute:' : 'Failed to unmute:', error);
      alert(blueskyModerationFailureMessage('mute', error));
    } finally {
      isTogglingMuteRef.current = false;
      setIsTogglingMute(false);
    }
  };

  const toggleBlock = async (block: boolean) => {
    if (loaded === undefined || isTogglingBlockRef.current) return;
    if (
      block
      && !confirm(
        `@${loaded.profile.handle} をブロックしますか？お互いの投稿が表示されなくなり、返信やメンションもできなくなります`,
      )
    ) {
      return;
    }
    isTogglingBlockRef.current = true;
    setIsTogglingBlock(true);
    try {
      const blockUri = loaded.moderation?.blockUri ?? undefined;
      const result = block
        ? await blockBlueskyActor(loaded.profile.did)
        : await unblockBlueskyActor(loaded.profile.did, blockUri);
      setData((prev) =>
        prev === null || 'error' in prev || prev.moderation === null
          ? prev
          : {
            ...prev,
            moderation: { ...prev.moderation, blockUri: result.blockUri },
          }
      );
    } catch (error) {
      console.error(block ? 'Failed to block:' : 'Failed to unblock:', error);
      alert(blueskyModerationFailureMessage('block', error));
    } finally {
      isTogglingBlockRef.current = false;
      setIsTogglingBlock(false);
    }
  };

  const closeReport = () => {
    setIsReportOpen(false);
    setReportError(undefined);
  };

  const submitReport = async (input: { category: ReportCategory; comment: string }) => {
    if (loaded === undefined || isReportingRef.current) return;
    isReportingRef.current = true;
    setIsReporting(true);
    setReportError(undefined);
    try {
      await reportBlueskyActor({ did: loaded.profile.did, ...input });
      closeReport();
      alert('通報しました');
    } catch (error) {
      console.error('Failed to report:', error);
      setReportError(blueskyModerationFailureMessage('report', error));
    } finally {
      isReportingRef.current = false;
      setIsReporting(false);
    }
  };

  const openMessage = async () => {
    if (loaded === undefined || isOpeningMessageRef.current) return;
    isOpeningMessageRef.current = true;
    setIsOpeningMessage(true);
    setMessageError(null);
    try {
      const { convoId } = await openBlueskyChatConvo(loaded.profile.did);
      window.location.href = chatConvoPath(convoId);
    } catch (error) {
      console.error('Failed to open the Bluesky conversation:', error);
      setMessageError(chatErrorMessageOf(error));
      isOpeningMessageRef.current = false;
      setIsOpeningMessage(false);
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
        moderation={data.moderation}
        isTogglingMute={isTogglingMute}
        isTogglingBlock={isTogglingBlock}
        isOpeningMessage={isOpeningMessage}
        messageError={messageError}
        onFollow={() => toggleFollow(true)}
        onUnfollow={() => toggleFollow(false)}
        onMute={() => toggleMute(true)}
        onUnmute={() => toggleMute(false)}
        onBlock={() => toggleBlock(true)}
        onUnblock={() => toggleBlock(false)}
        onReport={() => setIsReportOpen(true)}
        onMessage={openMessage}
        actions={actions}
      />
      <BlueskyReplyModal dialog={replyDialog} />
      <BlueskyReportPostModal reportDialog={reportDialog} />
      <ReportModal
        targetLabel={`@${data.profile.handle}`}
        isOpen={isReportOpen}
        isSubmitting={isReporting}
        {...(reportError === undefined ? {} : { error: reportError })}
        onSubmit={submitReport}
        onClose={closeReport}
      />
      <BlueskyQuoteModal dialog={quoteDialog} />
    </>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
