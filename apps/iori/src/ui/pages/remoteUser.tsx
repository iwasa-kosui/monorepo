import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Account, Status } from '../../adaptor/mastodon/entities.ts';
import { safeUrl } from '../../helper/safeUrl.ts';
import {
  failureMessage,
  favourite,
  fetchAccount,
  fetchAccountStatuses,
  fetchRelationshipOrSignedOut,
  follow,
  isNotFoundError,
  mute,
  unfollow,
  unmute,
} from '../api/mastodonClient.ts';
import { isLocalAccount, updateStatusesByPostId, withUpdatedStatus } from '../api/status.ts';
import { PostView } from '../components/PostView.tsx';
import { appendUniqueById } from '../hooks/appendUnique.ts';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';

type Props = Readonly<{
  account: Account;
  statuses: readonly Status[];
  isFollowing: boolean;
  isMuted: boolean;
  isLoggedIn: boolean;
  onLike: (postId: string) => Promise<void>;
  onFollow: () => Promise<void>;
  onUnfollow: () => Promise<void>;
  onMute: () => Promise<void>;
  onUnmute: () => Promise<void>;
  likingPostId: string | null;
  isMuting: boolean;
  isTogglingFollow: boolean;
}>;

export const RemoteUserPage = ({
  account,
  statuses,
  isFollowing,
  isMuted,
  isLoggedIn,
  onLike,
  onFollow,
  onUnfollow,
  onMute,
  onUnmute,
  likingPostId,
  isMuting,
  isTogglingFollow,
}: Props) => {
  const handle = account.acct;
  const displayName = account.username;

  const logoUrl = safeUrl(account.avatar);
  const profileUrl = safeUrl(account.url);

  return (
    <>
      <section class='mb-8'>
        <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover blob-bg'>
          <div class='flex items-center gap-4 mb-4 relative z-10'>
            <div class='w-16 h-16 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-clay-sm'>
              {logoUrl
                ? (
                  <img
                    src={logoUrl}
                    alt='User Logo'
                    class='w-16 h-16 blob-avatar object-cover'
                  />
                )
                : (
                  displayName.charAt(0).toUpperCase()
                )}
            </div>
            <div class='flex-1 min-w-0'>
              <h1 class='text-2xl font-bold text-charcoal dark:text-white truncate'>
                {displayName}
              </h1>
              <p class='text-charcoal-light dark:text-gray-400 truncate'>@{handle}</p>
            </div>
          </div>

          <div class='flex items-center gap-3'>
            {isLoggedIn
              ? (
                <>
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
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M15 11l2 2 4-4'
                          />
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
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M19 10h-2m-2 0h2m0 0V8m0 2v2'
                          />
                        </svg>
                      </button>
                    )}
                  {isMuted
                    ? (
                      <button
                        type='button'
                        onClick={onUnmute}
                        disabled={isMuting}
                        class='flex items-center justify-center p-2 rounded-xl text-terracotta dark:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
                        title='ミュート解除'
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
                            d='M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z'
                          />
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2'
                          />
                        </svg>
                      </button>
                    )
                    : (
                      <button
                        type='button'
                        onClick={onMute}
                        disabled={isMuting}
                        class='flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
                        title='ミュート'
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
                            d='M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z'
                          />
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2'
                          />
                        </svg>
                      </button>
                    )}
                </>
              )
              : (
                <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                  <a
                    href='/sign-in'
                    class='text-charcoal dark:text-gray-300 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
                  >
                    Sign in
                  </a>{' '}
                  to follow this user
                </p>
              )}
            {profileUrl && (
              <a
                href={profileUrl}
                target='_blank'
                rel='noopener noreferrer'
                class='flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
                title='元のプロフィールを表示'
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
        <h2 class='text-xl font-bold text-charcoal dark:text-white mb-4'>
          Posts
        </h2>
        {statuses.length === 0 ? <p class='text-charcoal-light dark:text-gray-400'>No posts yet.</p> : (
          statuses.map((status) => (
            <PostView
              key={status.id}
              status={status}
              onLike={onLike}
              isLiking={likingPostId === status.id}
            />
          ))
        )}
      </section>
    </>
  );
};

type RemoteUserData = Readonly<{
  account: Account;
  statuses: readonly Status[];
  nextMaxId: string | undefined;
  isFollowing: boolean;
  isMuted: boolean;
  isLoggedIn: boolean;
}>;

const getActorIdFromUrl = () => {
  const pathParts = window.location.pathname.split('/');
  const actorIdIndex = pathParts.indexOf('remote-users') + 1;
  return pathParts[actorIdIndex];
};

const App = () => {
  const isFetchingMoreRef = useRef(false);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const [isMuting, setIsMuting] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [data, setData] = useState<{ error: string } | RemoteUserData | null>(null);

  useEffect(() => {
    const actorId = getActorIdFromUrl();
    if (!actorId) return;
    const fetchFirstPage = async () => {
      try {
        const [account, page, relationship] = await Promise.all([
          fetchAccount(actorId),
          fetchAccountStatuses(actorId, { excludeReblogs: true }),
          fetchRelationshipOrSignedOut(actorId),
        ]);
        if (isLocalAccount(account)) {
          window.location.replace(`/users/${encodeURIComponent(account.username)}`);
          return;
        }
        setData({ account, statuses: page.items, nextMaxId: page.nextMaxId, ...relationship });
      } catch (error) {
        setData({
          error: isNotFoundError(error)
            ? `Remote actor with ID "${actorId}" was not found.`
            : error instanceof Error
            ? error.message
            : String(error),
        });
      }
    };
    fetchFirstPage();
  }, []);

  const loaded = data !== null && !('error' in data) ? data : undefined;
  const accountId = loaded?.account.id;

  const loadMore = useCallback(async (maxId: string) => {
    if (accountId === undefined || isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;
    try {
      const page = await fetchAccountStatuses(accountId, { maxId, excludeReblogs: true });
      const nextMaxId = page.items.length === 0 || page.nextMaxId === maxId ? undefined : page.nextMaxId;
      setData((prev) =>
        prev === null || 'error' in prev
          ? prev
          : { ...prev, statuses: appendUniqueById(prev.statuses, page.items), nextMaxId }
      );
    } catch (error) {
      console.error('Failed to load more posts:', error);
    } finally {
      isFetchingMoreRef.current = false;
    }
  }, [accountId]);

  useInfiniteScroll({ nextCursor: loaded?.nextMaxId, onLoadMore: loadMore });

  const handleLike = async (postId: string) => {
    setLikingPostId(postId);
    try {
      const updated = await favourite(postId);
      setData((prev) =>
        prev === null || 'error' in prev
          ? prev
          : {
            ...prev,
            statuses: updateStatusesByPostId(prev.statuses, postId, (status) => withUpdatedStatus(status, updated)),
          }
      );
    } catch (error) {
      console.error('Failed to like:', error);
    } finally {
      setLikingPostId(null);
    }
  };

  const handleFollow = async () => {
    if (!data || 'error' in data) return;
    setIsTogglingFollow(true);
    try {
      const relationship = await follow(data.account.id);
      setData((prev) => prev === null || 'error' in prev ? prev : { ...prev, isFollowing: relationship.following });
    } catch (error) {
      console.error('Failed to follow:', error);
      alert(failureMessage('follow', error));
    } finally {
      setIsTogglingFollow(false);
    }
  };

  const handleUnfollow = async () => {
    if (!data || 'error' in data) return;
    setIsTogglingFollow(true);
    try {
      const relationship = await unfollow(data.account.id);
      setData((prev) => prev === null || 'error' in prev ? prev : { ...prev, isFollowing: relationship.following });
    } catch (error) {
      console.error('Failed to unfollow:', error);
      alert(failureMessage('unfollow', error));
    } finally {
      setIsTogglingFollow(false);
    }
  };

  const handleMute = async () => {
    if (!data || 'error' in data) return;
    setIsMuting(true);
    try {
      const relationship = await mute(data.account.id);
      setData((prev) => prev === null || 'error' in prev ? prev : { ...prev, isMuted: relationship.muting });
    } catch (error) {
      console.error('Failed to mute:', error);
      alert(failureMessage('mute', error));
    } finally {
      setIsMuting(false);
    }
  };

  const handleUnmute = async () => {
    if (!data || 'error' in data) return;
    setIsMuting(true);
    try {
      const relationship = await unmute(data.account.id);
      setData((prev) => prev === null || 'error' in prev ? prev : { ...prev, isMuted: relationship.muting });
    } catch (error) {
      console.error('Failed to unmute:', error);
      alert(failureMessage('unmute', error));
    } finally {
      setIsMuting(false);
    }
  };

  if (data === null) {
    return <div class='text-charcoal-light dark:text-gray-400'>Loading...</div>;
  }

  if ('error' in data) {
    return <div class='text-red-500'>Error: {data.error}</div>;
  }

  return (
    <RemoteUserPage
      account={data.account}
      statuses={data.statuses}
      isFollowing={data.isFollowing}
      isMuted={data.isMuted}
      isLoggedIn={data.isLoggedIn}
      onLike={handleLike}
      onFollow={handleFollow}
      onUnfollow={handleUnfollow}
      onMute={handleMute}
      onUnmute={handleUnmute}
      likingPostId={likingPostId}
      isMuting={isMuting}
      isTogglingFollow={isTogglingFollow}
    />
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
