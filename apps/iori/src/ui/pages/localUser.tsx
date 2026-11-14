import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Account, Status } from '../../adaptor/mastodon/entities.ts';
import { safeUrl } from '../../helper/safeUrl.ts';
import {
  failureMessage,
  fetchAccountStatuses,
  fetchFollowers,
  fetchFollowing,
  fetchRelationshipOrSignedOut,
  fetchVerifyCredentials,
  follow,
  isNotFoundError,
  lookupAccount,
  unfollow,
} from '../api/mastodonClient.ts';
import { accountHandle, remoteUserPathOf, updateStatusesByPostId } from '../api/status.ts';
import { ActorLink } from '../components/ActorLink.tsx';
import { FediverseReplyModal } from '../components/FediverseReplyModal.tsx';
import { FollowToggleButton } from '../components/FollowToggleButton.tsx';
import { PostView } from '../components/PostView.tsx';
import { statusActionProps, type StatusActions } from '../components/statusActionProps.ts';
import { appendUniqueById } from '../hooks/appendUnique.ts';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';
import { useReplyDialog, type UseReplyDialogReturn } from '../hooks/useReplyDialog.ts';
import { useStatusListActions } from '../hooks/useStatusListActions.ts';

const ACCOUNT_LIST_LIMIT = 80;

type Props = Readonly<{
  account: Account;
  handle: string;
  followers: readonly Account[];
  following: readonly Account[];
  statuses: readonly Status[];
  isLoggedIn: boolean;
  actions?: StatusActions;
  reply?: UseReplyDialogReturn;
  /** ログインしていて、表示中のアカウントが自分ではないときだけ渡す */
  followToggle?: FollowToggle;
}>;

type FollowToggle = Readonly<{
  following: boolean;
  disabled: boolean;
  onToggle: () => unknown;
}>;

export const LocalUserPage = ({
  account,
  handle,
  followers,
  following,
  statuses,
  isLoggedIn,
  actions,
  reply,
  followToggle,
}: Props) => {
  const logoUrl = safeUrl(account.avatar);

  return (
    <>
      <div class='flex items-center justify-between mb-6'>
        <a
          href='/'
          class='text-2xl font-bold text-charcoal dark:text-white hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
        >
          blog.kosui.me
        </a>
        <a
          href='/about'
          class='text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
        >
          ioriについて
        </a>
      </div>
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
                  account.username.charAt(0).toUpperCase()
                )}
            </div>
            <div class='flex-1 min-w-0'>
              <h1 class='text-2xl font-bold text-charcoal dark:text-white truncate'>
                {account.username}
              </h1>
              <p class='text-charcoal-light dark:text-gray-400 truncate'>{handle}</p>
            </div>
          </div>

          <div class='flex flex-wrap items-center gap-4'>
            <div class='flex gap-6 text-sm'>
              <div>
                <span class='font-semibold text-charcoal dark:text-white'>
                  {account.followers_count}
                </span>
                <a
                  class='text-charcoal-light dark:text-gray-400 ml-1 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
                  href='#followers'
                >
                  Followers
                </a>
              </div>
              <div>
                <span class='font-semibold text-charcoal dark:text-white'>
                  {account.following_count}
                </span>
                <a
                  class='text-charcoal-light dark:text-gray-400 ml-1 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
                  href='#following'
                >
                  Following
                </a>
              </div>
              <div>
                <span class='font-semibold text-charcoal dark:text-white'>
                  {account.statuses_count}
                </span>
                <span class='text-charcoal-light dark:text-gray-400 ml-1'>Posts</span>
              </div>
            </div>
            {followToggle !== undefined
              ? (
                <div class='ml-auto'>
                  <FollowToggleButton
                    following={followToggle.following}
                    disabled={followToggle.disabled}
                    onClick={followToggle.onToggle}
                  />
                </div>
              )
              : (
                <a
                  href='#remote-follow'
                  class='ml-auto px-4 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
                >
                  Remote Follow
                </a>
              )}
          </div>
        </div>

        <div>
          <div class='hidden target:block' id='followers'>
            <a
              href='#'
              class='w-full h-full bg-charcoal/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
              aria-label='Close modal'
            />
            <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
              <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md pointer-events-auto'>
                <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-3'>
                  Followers
                </h2>
                {followers.length > 0
                  ? (
                    <div class='space-y-1 max-h-48 overflow-y-auto'>
                      {followers.map((follower) => <ActorLink key={follower.id} account={follower} />)}
                    </div>
                  )
                  : (
                    <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                      No followers yet
                    </p>
                  )}
                <div class='flex mt-3 justify-end'>
                  <a href='#'>
                    <button class='px-4 py-1.5 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'>
                      Close
                    </button>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div class='hidden target:block' id='following'>
            <a
              href='#'
              class='w-full h-full bg-charcoal/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
              aria-label='Close modal'
            />
            <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
              <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md pointer-events-auto'>
                <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-3'>
                  Following
                </h2>
                {following.length > 0
                  ? (
                    <div class='space-y-1 max-h-48 overflow-y-auto'>
                      {following.map((followed) => <ActorLink key={followed.id} account={followed} />)}
                    </div>
                  )
                  : (
                    <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                      Not following anyone yet
                    </p>
                  )}
                <div class='flex mt-3 justify-end'>
                  <a href='#'>
                    <button class='px-4 py-1.5 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'>
                      Close
                    </button>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div class='hidden target:block' id='remote-follow'>
            <a
              href='#'
              class='w-full h-full bg-charcoal/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
              aria-label='Close modal'
            />
            <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
              <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md pointer-events-auto'>
                <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-4'>
                  Remote Follow
                </h2>

                <form method='post' action={`/users/${account.username}/remote-follow`} class='space-y-3'>
                  <input
                    type='text'
                    name='handle'
                    placeholder='@you@your-server.example'
                    required
                    class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset transition-all'
                  />
                  <button
                    type='submit'
                    class='w-full px-4 py-2 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
                  >
                    Proceed to your server
                  </button>
                </form>

                <div class='flex items-center gap-3 my-4'>
                  <div class='flex-1 h-px bg-warm-gray-dark dark:bg-gray-600' />
                  <span class='text-xs text-charcoal-light dark:text-gray-500 uppercase'>or</span>
                  <div class='flex-1 h-px bg-warm-gray-dark dark:bg-gray-600' />
                </div>

                <div>
                  <p class='text-xs text-charcoal-light dark:text-gray-400 mb-2'>
                    Copy handle to search manually on your server:
                  </p>
                  <div class='flex items-center gap-2 p-3 bg-sand-light/50 dark:bg-gray-700/50 rounded-xl shadow-clay-inset'>
                    <code class='flex-1 text-sm text-charcoal dark:text-gray-300 break-all'>{handle}</code>
                    <button
                      type='button'
                      onclick={`navigator.clipboard.writeText('${handle}'); this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy', 1500)`}
                      class='px-3 py-1.5 bg-warm-gray dark:bg-gray-600 text-charcoal dark:text-gray-300 text-xs rounded-lg hover:bg-warm-gray-dark dark:hover:bg-gray-500 transition-colors flex-shrink-0 shadow-clay-sm'
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div class='flex mt-4 justify-end'>
                  <a href='#'>
                    <button class='px-4 py-1.5 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'>
                      Close
                    </button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class='space-y-6 py-2'>
        {reply !== undefined && <FediverseReplyModal dialog={reply} />}
        <h2 class='text-lg font-semibold text-charcoal dark:text-white'>Posts</h2>
        {statuses.length > 0
          ? (
            statuses.map((status) => (
              <PostView
                key={status.id}
                status={status}
                isLoggedIn={isLoggedIn}
                {...statusActionProps(isLoggedIn ? actions : undefined, status)}
                onReply={isLoggedIn ? reply?.openReplyDialog : undefined}
              />
            ))
          )
          : (
            <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 text-center'>
              <p class='text-gray-500 dark:text-gray-400'>No posts yet</p>
            </div>
          )}
      </section>
    </>
  );
};

type LocalUserData = Readonly<{
  account: Account;
  followers: readonly Account[];
  following: readonly Account[];
  statuses: readonly Status[];
  nextMaxId: string | undefined;
  /** ログインしていて、自分以外のアカウントを見ているときのフォロー状態 */
  isFollowing: boolean | undefined;
}>;

const getUsernameFromUrl = () => {
  const pathParts = window.location.pathname.split('/');
  const usernameIndex = pathParts.indexOf('users') + 1;
  return pathParts[usernameIndex];
};

const getIsLoggedIn = (): boolean => {
  const root = document.getElementById('root');
  return root?.dataset.isLoggedIn === 'true';
};

// 自分のページではフォローボタンを出さない。取得に失敗したときもボタンを出さずにページは表示する
const fetchFollowingState = async (accountId: string): Promise<boolean | undefined> => {
  try {
    const [me, relationship] = await Promise.all([
      fetchVerifyCredentials(),
      fetchRelationshipOrSignedOut(accountId),
    ]);
    return me.id === accountId || !relationship.isLoggedIn ? undefined : relationship.isFollowing;
  } catch {
    return undefined;
  }
};

const App = () => {
  const [data, setData] = useState<{ error: string } | LocalUserData | null>(null);
  const [isLoggedIn] = useState(() => getIsLoggedIn());
  const isFetchingMoreRef = useRef(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  useEffect(() => {
    const username = getUsernameFromUrl();
    if (!username) return;
    const fetchFirstPage = async () => {
      try {
        const account = await lookupAccount(username);
        const remotePath = remoteUserPathOf(account);
        if (remotePath !== undefined) {
          window.location.replace(remotePath);
          return;
        }
        const [page, followers, following, isFollowing] = await Promise.all([
          fetchAccountStatuses(account.id, { excludeReblogs: true }),
          fetchFollowers(account.id, { limit: ACCOUNT_LIST_LIMIT }),
          fetchFollowing(account.id, { limit: ACCOUNT_LIST_LIMIT }),
          isLoggedIn ? fetchFollowingState(account.id) : Promise.resolve(undefined),
        ]);
        setData({
          account,
          followers: followers.items,
          following: following.items,
          statuses: page.items,
          nextMaxId: page.nextMaxId,
          isFollowing,
        });
      } catch (error) {
        setData({
          error: isNotFoundError(error)
            ? `The user with username "${username}" was not found.`
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

  const updateStatus = useCallback((postId: string, updater: (status: Status) => Status) => {
    setData((prev) =>
      prev === null || 'error' in prev
        ? prev
        : { ...prev, statuses: updateStatusesByPostId(prev.statuses, postId, updater) }
    );
  }, []);

  const actions = useStatusListActions(updateStatus);
  const reply = useReplyDialog();

  const toggleFollow = async () => {
    if (loaded === undefined || loaded.isFollowing === undefined) return;
    const action = loaded.isFollowing ? 'unfollow' : 'follow';
    setIsTogglingFollow(true);
    try {
      const relationship = await (loaded.isFollowing ? unfollow : follow)(loaded.account.id);
      setData((prev) => prev === null || 'error' in prev ? prev : { ...prev, isFollowing: relationship.following });
    } catch (error) {
      console.error(`Failed to ${action}:`, error);
      alert(failureMessage(action, error));
    } finally {
      setIsTogglingFollow(false);
    }
  };

  if (data === null) {
    return <div class='text-gray-500 dark:text-gray-400'>Loading...</div>;
  }

  if ('error' in data) {
    return <div class='text-red-500'>Error: {data.error}</div>;
  }

  return (
    <LocalUserPage
      account={data.account}
      handle={`@${accountHandle(data.account)}`}
      followers={data.followers}
      following={data.following}
      statuses={data.statuses}
      isLoggedIn={isLoggedIn}
      actions={actions}
      reply={reply}
      followToggle={data.isFollowing === undefined
        ? undefined
        : { following: data.isFollowing, disabled: isTogglingFollow, onToggle: toggleFollow }}
    />
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
