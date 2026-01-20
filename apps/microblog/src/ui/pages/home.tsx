import { hc } from 'hono/client';
import { useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';
import type { Actor } from '../../domain/actor/actor.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { TimelineItemWithPost } from '../../domain/timeline/timelineItem.ts';
import type { User } from '../../domain/user/user.ts';
import { ActorLink } from '../components/ActorLink.tsx';
import { Modal } from '../components/Modal.tsx';
import { PostForm } from '../components/PostForm.tsx';
import { PostView } from '../components/PostView.tsx';

const client = hc<APIRouterType>('/api');

type Props = Readonly<{
  user: User;
  timelineItems: ReadonlyArray<TimelineItemWithPost>;
  actor: Actor;
  followers: ReadonlyArray<Actor>;
  following: ReadonlyArray<Actor>;
  fetchData: (createdAt: Instant | undefined) => Promise<void>;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  onLike: (postId: string) => Promise<void>;
  likingPostId: string | null;
  onUndoLike: (postId: string) => Promise<void>;
  undoingLikePostId: string | null;
  onRepost: (postId: string) => Promise<void>;
  repostingPostId: string | null;
  onUndoRepost: (postId: string) => Promise<void>;
  undoingRepostPostId: string | null;
  onDelete: (postId: string) => Promise<void>;
  deletingPostId: string | null;
  onEmojiReact: (postId: string, emoji: string) => Promise<void>;
  onUndoEmojiReact: (postId: string, emoji: string) => Promise<void>;
  emojiReactingPostId: string | null;
  myReactions: ReadonlyMap<string, readonly string[]>;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  emojiPickerOpenForIndex: number | null;
  setEmojiPickerOpenForIndex: (index: number | null) => void;
  onReply: (postId: string) => void;
  replyingToPostId: string | null;
  onSendReply: (postId: string, content: string) => Promise<void>;
  onCancelReply: () => void;
  isSendingReply: boolean;
  onShowThread: (postId: string) => void;
  threadModalPostId: string | null;
  threadData: {
    currentPost: PostWithAuthor | null;
    ancestors: PostWithAuthor[];
    descendants: PostWithAuthor[];
  } | null;
  isLoadingThread: boolean;
  onCloseThread: () => void;
}>;

export const HomePage = ({
  user,
  timelineItems,
  actor,
  followers,
  following,
  fetchData,
  onRefresh,
  isRefreshing,
  onLike,
  likingPostId,
  onUndoLike,
  undoingLikePostId,
  onRepost,
  repostingPostId,
  onUndoRepost,
  undoingRepostPostId,
  onDelete,
  deletingPostId,
  onEmojiReact,
  onUndoEmojiReact,
  emojiReactingPostId,
  myReactions,
  selectedIndex,
  setSelectedIndex,
  emojiPickerOpenForIndex,
  setEmojiPickerOpenForIndex,
  onReply,
  replyingToPostId,
  onSendReply,
  onCancelReply,
  isSendingReply,
  onShowThread,
  threadModalPostId,
  threadData,
  isLoadingThread,
  onCloseThread,
}: Props) => {
  const [replyContent, setReplyContent] = useState('');
  const [pullDistance, setPullDistance] = useState(0);
  const isPullingRef = useRef(false);
  const touchStartY = useRef<number>(0);
  const pullThreshold = 60; // pixels to trigger refresh
  // Store latest values in refs to avoid stale closures in event handlers
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(isRefreshing);
  isRefreshingRef.current = isRefreshing;

  const url = new URL(actor.uri);
  const handle = `@${user.username}@${url.host}`;
  const debounce = <T extends unknown[]>(
    func: (...args: T) => void,
    wait: number,
  ) => {
    let timeoutId: NodeJS.Timeout | undefined;
    return (...args: T) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func(...args);
      }, wait);
    };
  };
  const debouncedFetchData = debounce(fetchData, 300);

  // Pull to refresh handlers - use refs to avoid re-registering event listeners
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        touchStartY.current = e.touches[0].clientY;
        isPullingRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current) return;
      if (window.scrollY > 0) {
        isPullingRef.current = false;
        setPullDistance(0);
        pullDistanceRef.current = 0;
        return;
      }

      const currentY = e.touches[0].clientY;
      const startY = touchStartY.current ?? 0;
      const distance = Math.max(0, (currentY - startY) * 0.7);
      const clampedDistance = Math.min(distance, pullThreshold * 1.5);
      setPullDistance(clampedDistance);
      pullDistanceRef.current = clampedDistance;
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;

      if (
        (pullDistanceRef.current ?? 0) >= pullThreshold
        && !isRefreshingRef.current
      ) {
        onRefresh();
      }
      setPullDistance(0);
      pullDistanceRef.current = 0;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh]);

  // Scroll selected post into view
  const scrollToSelected = (index: number) => {
    const postElements = document.querySelectorAll('[data-post-index]');
    const targetElement = postElements[index] as HTMLElement | undefined;
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Clear timeline focus when post modal opens
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#post-modal') {
        setSelectedIndex(-1);
      }
    };

    // Check initial hash
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea, or contenteditable
      const activeElement = document.activeElement as HTMLElement | null;
      if (
        activeElement
        && (activeElement.tagName === 'INPUT'
          || activeElement.tagName === 'TEXTAREA'
          || activeElement.isContentEditable)
      ) {
        return;
      }

      // Check if post modal is open
      const isPostModalOpen = window.location.hash === '#post-modal';

      // N key: Open post modal (when not already open)
      if (e.key === 'n' || e.key === 'N') {
        if (!isPostModalOpen) {
          e.preventDefault();
          window.location.hash = '#post-modal';
        }
        return;
      }

      // Escape key: Close modal or clear focus
      if (e.key === 'Escape') {
        if (isPostModalOpen) {
          e.preventDefault();
          window.location.hash = '';
          return;
        }
        if (threadModalPostId !== null) {
          e.preventDefault();
          onCloseThread();
          return;
        }
        if (replyingToPostId !== null) {
          e.preventDefault();
          onCancelReply();
          return;
        }
        if (emojiPickerOpenForIndex !== null) {
          e.preventDefault();
          setEmojiPickerOpenForIndex(null);
          return;
        }
        // Clear focus if a post is selected
        if (selectedIndex >= 0) {
          e.preventDefault();
          setSelectedIndex(-1);
          return;
        }
        return;
      }

      // J/K keys: If no post is focused, focus the first post
      if (e.key === 'j' || e.key === 'k') {
        if (selectedIndex < 0 && timelineItems.length > 0) {
          e.preventDefault();
          setSelectedIndex(0);
          scrollToSelected(0);
          return;
        }
      }

      const selectedItem = timelineItems[selectedIndex];
      if (!selectedItem) return;

      const post = selectedItem.post;

      switch (e.key) {
        case 'j': // Move down
          e.preventDefault();
          if (selectedIndex < timelineItems.length - 1) {
            const newIndex = selectedIndex + 1;
            setSelectedIndex(newIndex);
            scrollToSelected(newIndex);
          }
          break;
        case 'k': // Move up
          e.preventDefault();
          if (selectedIndex > 0) {
            const newIndex = selectedIndex - 1;
            setSelectedIndex(newIndex);
            scrollToSelected(newIndex);
          }
          break;
        case 'l': // Like or undo like selected post
          e.preventDefault();
          if (post.liked && !undoingLikePostId) {
            onUndoLike(post.postId);
          } else if (!post.liked && !likingPostId) {
            onLike(post.postId);
          }
          break;
        case 'o': // Open selected post
        case 'Enter':
          e.preventDefault();
          if (post.type === 'local') {
            window.location.href = `/users/${post.username}/posts/${post.postId}`;
          } else if (post.type === 'remote' && 'uri' in post) {
            window.open(post.uri, '_blank');
          }
          break;
        case 'g': // Go to top (gg in vim, but we use single g)
          e.preventDefault();
          setSelectedIndex(0);
          scrollToSelected(0);
          break;
        case 'G': {
          // Go to bottom (Shift+G)
          e.preventDefault();
          const lastIndex = timelineItems.length - 1;
          setSelectedIndex(lastIndex);
          scrollToSelected(lastIndex);
          break;
        }
        case 'e': {
          // Open emoji picker for selected post
          e.preventDefault();
          setEmojiPickerOpenForIndex(
            emojiPickerOpenForIndex === selectedIndex ? null : selectedIndex,
          );
          break;
        }
        case 'p': {
          // Reply to selected post
          e.preventDefault();
          onReply(post.postId);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedIndex,
    timelineItems,
    likingPostId,
    undoingLikePostId,
    repostingPostId,
    emojiPickerOpenForIndex,
    replyingToPostId,
    threadModalPostId,
  ]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.body.scrollHeight;
      const scrollTop = document.body.scrollTop;
      const clientHeight = document.body.clientHeight;
      if (scrollTop + clientHeight >= scrollHeight - 10) {
        const oldest = timelineItems.reduce((prev, curr) =>
          new Date(prev.createdAt) < new Date(curr.createdAt) ? prev : curr
        );
        debouncedFetchData(oldest.createdAt);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [timelineItems]);
  return (
    <>
      <section class='hidden md:block mb-8'>
        <header class='mb-4'>
          <h1 class='text-2xl font-bold text-gray-900 dark:text-white'>
            Hi, {String(user.username)}
          </h1>
        </header>
        <section class='mb-8'>
          <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6'>
            <div class='flex items-center gap-4 mb-4'>
              <a href='#update-bio' class='relative group flex-shrink-0'>
                <div class='w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-2xl font-bold'>
                  {actor.logoUri
                    ? (
                      <img
                        src={actor.logoUri}
                        alt='User Logo'
                        class='w-16 h-16 rounded-full object-cover'
                      />
                    )
                    : (
                      String(user.username).charAt(0).toUpperCase()
                    )}
                </div>
                <div class='absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity'>
                  <svg
                    class='w-5 h-5 text-white'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      stroke-linecap='round'
                      stroke-linejoin='round'
                      stroke-width='2'
                      d='M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z'
                    />
                  </svg>
                </div>
              </a>
              <div>
                <h1 class='text-2xl font-bold text-gray-900 dark:text-white'>
                  {String(user.username)}
                </h1>
                <p class='text-gray-500 dark:text-gray-400'>{handle}</p>
              </div>
            </div>

            <div class='flex gap-6 text-sm'>
              <div>
                <span class='font-semibold text-gray-900 dark:text-white'>
                  {followers.length}
                </span>
                <a
                  class='text-gray-500 dark:text-gray-400 ml-1'
                  href='#followers'
                >
                  Followers
                </a>
              </div>
              <div>
                <span class='font-semibold text-gray-900 dark:text-white'>
                  {following.length}
                </span>
                <a
                  class='text-gray-500 dark:text-gray-400 ml-1'
                  href='#following'
                >
                  Following
                </a>
              </div>
              <div>
                <span class='font-semibold text-gray-900 dark:text-white'>
                  {timelineItems.length}
                </span>
                <span class='text-gray-500 dark:text-gray-400 ml-1'>Posts</span>
              </div>
            </div>
          </div>

          <div>
            <Modal id='followers'>
              <h2 class='text-lg font-semibold text-gray-900 dark:text-white mb-3'>
                Followers
              </h2>
              {followers.length > 0
                ? (
                  <div class='space-y-1 max-h-48 overflow-y-auto'>
                    {followers.map((follower) => <ActorLink key={follower.id} actor={follower} />)}
                  </div>
                )
                : (
                  <p class='text-gray-500 dark:text-gray-400 text-sm'>
                    No followers yet
                  </p>
                )}
            </Modal>

            <Modal id='following'>
              <h2 class='text-lg font-semibold text-gray-900 dark:text-white mb-3'>
                Following
              </h2>
              {following.length > 0
                ? (
                  <div class='space-y-1 max-h-48 overflow-y-auto'>
                    {following.map((followed) => <ActorLink key={followed.id} actor={followed} />)}
                  </div>
                )
                : (
                  <p class='text-gray-500 dark:text-gray-400 text-sm'>
                    Not following anyone yet
                  </p>
                )}
            </Modal>
          </div>
        </section>

        <PostForm id='post' />
      </section>
      <Modal id='post-modal' showCloseButton={false}>
        <PostForm formId='post-modal-form' />
      </Modal>
      <Modal id='update-bio' showCloseButton={false}>
        <form method='post' action={`/users/${user.username}`}>
          <p class='text-gray-600 dark:text-gray-400 text-sm mb-3'>
            Enter a URL for your profile image
          </p>
          <input
            type='url'
            name='logoUri'
            placeholder='https://example.com/image.png'
            class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3'
          />
          <div class='flex gap-2 justify-end'>
            <a href='#'>
              <button
                type='button'
                class='px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'
              >
                Cancel
              </button>
            </a>
            <button
              type='submit'
              class='px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-2xl transition-colors'
            >
              Update
            </button>
          </div>
        </form>
      </Modal>
      {/* Pull to Refresh Indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          class='flex items-center justify-center overflow-hidden transition-all duration-200'
          style={{ height: isRefreshing ? '48px' : `${pullDistance}px` }}
        >
          <div class='flex items-center gap-2 text-gray-500 dark:text-gray-400'>
            {isRefreshing
              ? (
                <>
                  <svg class='animate-spin h-5 w-5' viewBox='0 0 24 24'>
                    <circle
                      class='opacity-25'
                      cx='12'
                      cy='12'
                      r='10'
                      stroke='currentColor'
                      stroke-width='4'
                      fill='none'
                    />
                    <path
                      class='opacity-75'
                      fill='currentColor'
                      d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                    />
                  </svg>
                  <span class='text-sm'>更新中...</span>
                </>
              )
              : pullDistance >= pullThreshold
              ? (
                <>
                  <svg
                    class='h-5 w-5 rotate-180'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                  >
                    <path
                      stroke-linecap='round'
                      stroke-linejoin='round'
                      stroke-width='2'
                      d='M19 14l-7 7m0 0l-7-7m7 7V3'
                    />
                  </svg>
                  <span class='text-sm'>離して更新</span>
                </>
              )
              : (
                <>
                  <svg
                    class='h-5 w-5'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                  >
                    <path
                      stroke-linecap='round'
                      stroke-linejoin='round'
                      stroke-width='2'
                      d='M19 14l-7 7m0 0l-7-7m7 7V3'
                    />
                  </svg>
                  <span class='text-sm'>引っ張って更新</span>
                </>
              )}
          </div>
        </div>
      )}
      {/* Reply Modal */}
      {replyingToPostId && (
        <div
          class='fixed inset-0 bg-black/50 flex items-center justify-center z-50'
          onClick={onCancelReply}
        >
          <div
            class='bg-white dark:bg-gray-800 rounded-3xl shadow-lg p-6 max-w-lg w-full mx-4'
            onClick={(e) => e.stopPropagation()}
          >
            <h2 class='text-lg font-semibold text-gray-900 dark:text-white mb-3'>
              Reply
            </h2>
            <p class='text-gray-500 dark:text-gray-400 text-xs mb-3 truncate'>
              Replying to post: {replyingToPostId}
            </p>
            <textarea
              value={replyContent}
              onInput={(e) => setReplyContent((e.target as HTMLTextAreaElement).value)}
              placeholder='Write your reply...'
              class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3 resize-none'
              rows={4}
              disabled={isSendingReply}
            />
            <div class='flex gap-2 justify-end'>
              <button
                type='button'
                onClick={onCancelReply}
                class='px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'
                disabled={isSendingReply}
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={() => {
                  if (replyContent.trim()) {
                    onSendReply(replyingToPostId, replyContent);
                    setReplyContent('');
                  }
                }}
                class={`px-5 py-2 text-white text-sm font-medium rounded-2xl transition-colors ${
                  isSendingReply || !replyContent.trim()
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
                disabled={isSendingReply || !replyContent.trim()}
              >
                {isSendingReply ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Thread Modal */}
      {threadModalPostId && (
        <div
          class='fixed inset-0 bg-black/50 flex items-center justify-center z-50'
          onClick={onCloseThread}
        >
          <div
            class='bg-white dark:bg-gray-800 rounded-3xl shadow-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto'
            onClick={(e) => e.stopPropagation()}
          >
            <div class='flex items-center justify-between mb-4'>
              <h2 class='text-lg font-semibold text-gray-900 dark:text-white'>
                Thread
              </h2>
              <button
                type='button'
                onClick={onCloseThread}
                class='text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              >
                <svg
                  class='w-5 h-5'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d='M6 18L18 6M6 6l12 12'
                  />
                </svg>
              </button>
            </div>
            {isLoadingThread
              ? (
                <div class='flex items-center justify-center py-8'>
                  <svg
                    class='animate-spin h-8 w-8 text-blue-500'
                    viewBox='0 0 24 24'
                  >
                    <circle
                      class='opacity-25'
                      cx='12'
                      cy='12'
                      r='10'
                      stroke='currentColor'
                      stroke-width='4'
                      fill='none'
                    />
                    <path
                      class='opacity-75'
                      fill='currentColor'
                      d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                    />
                  </svg>
                </div>
              )
              : threadData
              ? (
                <div class='space-y-3'>
                  {/* Ancestors (replies above) */}
                  {threadData.ancestors.length > 0 && (
                    <>
                      {threadData.ancestors.map((post) => (
                        <div key={post.postId} class='relative'>
                          <PostView post={post} currentUserId={user.id} onReply={onReply} />
                        </div>
                      ))}
                    </>
                  )}
                  {/* Current post */}
                  {threadData.currentPost && (
                    <div class='relative ring-2 ring-blue-500 dark:ring-blue-400 rounded-3xl'>
                      <PostView
                        post={threadData.currentPost}
                        currentUserId={user.id}
                        onReply={onReply}
                      />
                    </div>
                  )}
                  {/* Descendants (replies below) */}
                  {threadData.descendants.length > 0
                    ? (
                      <>
                        {threadData.descendants.map((post) => (
                          <div key={post.postId} class='relative'>
                            <PostView post={post} currentUserId={user.id} onReply={onReply} />
                          </div>
                        ))}
                      </>
                    )
                    : (
                      threadData.ancestors.length === 0
                      && !threadData.currentPost && (
                        <p class='text-gray-500 dark:text-gray-400 text-center py-4'>
                          No replies in this thread yet
                        </p>
                      )
                    )}
                </div>
              )
              : (
                <p class='text-gray-500 dark:text-gray-400 text-center py-4'>
                  Failed to load thread
                </p>
              )}
          </div>
        </div>
      )}
      <section class='space-y-4'>
        {timelineItems.map((item, index) => {
          const postId = item.post.postId;
          const isMyRepost = item.type === 'repost' && item.repostedBy.actorId === actor.id;
          return (
            <PostView
              key={item.timelineItemId}
              post={item.post}
              repostedBy={item.type === 'repost' ? item.repostedBy : undefined}
              onLike={onLike}
              isLiking={likingPostId === postId}
              onUndoLike={onUndoLike}
              isUndoingLike={undoingLikePostId === postId}
              onRepost={onRepost}
              isReposting={repostingPostId === postId}
              onUndoRepost={isMyRepost ? onUndoRepost : undefined}
              isUndoingRepost={undoingRepostPostId === postId}
              onDelete={onDelete}
              isDeleting={deletingPostId === postId}
              onEmojiReact={onEmojiReact}
              onUndoEmojiReact={onUndoEmojiReact}
              isEmojiReacting={emojiReactingPostId === postId}
              myReactions={myReactions.get(postId) ?? []}
              currentUserId={user.id}
              isSelected={selectedIndex === index}
              dataIndex={index}
              isEmojiPickerOpen={emojiPickerOpenForIndex === index}
              onToggleEmojiPicker={() =>
                setEmojiPickerOpenForIndex(
                  emojiPickerOpenForIndex === index ? null : index,
                )}
              onReply={onReply}
              onShowThread={onShowThread}
            />
          );
        })}
      </section>
      <script src='https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js'></script>
    </>
  );
};

const App = () => {
  const [init, setInit] = useState(false);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const [undoingLikePostId, setUndoingLikePostId] = useState<string | null>(null);
  const [repostingPostId, setRepostingPostId] = useState<string | null>(null);
  const [undoingRepostPostId, setUndoingRepostPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [emojiReactingPostId, setEmojiReactingPostId] = useState<string | null>(null);
  const [myReactions, setMyReactions] = useState<Map<string, string[]>>(
    new Map(),
  );
  const [emojiPickerOpenForIndex, setEmojiPickerOpenForIndex] = useState<
    number | null
  >(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [replyingToPostId, setReplyingToPostId] = useState<string | null>(null);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [threadModalPostId, setThreadModalPostId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<
    {
      currentPost: PostWithAuthor | null;
      ancestors: PostWithAuthor[];
      descendants: PostWithAuthor[];
    } | null
  >(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [data, setData] = useState<
    | { error: string }
    | {
      user: User;
      actor: Actor;
      timelineItems: readonly TimelineItemWithPost[];
      followers: readonly Actor[];
      following: readonly Actor[];
    }
    | null
  >(null);

  const fetchData = async (createdAt: Instant | undefined) => {
    const res = await client.v1.home.$get({
      query: { createdAt: createdAt ? String(createdAt) : undefined },
    });
    const latest = await res.json();
    if (latest && !('error' in latest) && data && !('error' in data)) {
      setData({
        ...latest,
        timelineItems: [...data.timelineItems, ...latest.timelineItems],
      });
    } else {
      setData(latest);
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const res = await client.v1.home.$get({
        query: { createdAt: undefined },
      });
      const latest = await res.json();
      setData(latest);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLike = async (postId: string) => {
    setLikingPostId(postId);
    try {
      const res = await client.v1.like.$post({
        json: { postId },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Update the post's liked status in the local state
        if (data && !('error' in data)) {
          setData({
            ...data,
            timelineItems: data.timelineItems.map((item) =>
              item.post.postId === postId
                ? { ...item, post: { ...item.post, liked: true } }
                : item
            ),
          });
        }
      } else if ('error' in result) {
        console.error('Failed to like:', result.error);
      }
    } catch (error) {
      console.error('Failed to like:', error);
    } finally {
      setLikingPostId(null);
    }
  };

  const handleUndoLike = async (postId: string) => {
    setUndoingLikePostId(postId);
    try {
      const res = await client.v1.like.$delete({
        json: { postId },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Update the post's liked status in the local state
        if (data && !('error' in data)) {
          setData({
            ...data,
            timelineItems: data.timelineItems.map((item) =>
              item.post.postId === postId
                ? { ...item, post: { ...item.post, liked: false } }
                : item
            ),
          });
        }
      } else if ('error' in result) {
        console.error('Failed to undo like:', result.error);
        alert(`Failed to undo like: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to undo like:', error);
      alert('Failed to undo like. Please try again.');
    } finally {
      setUndoingLikePostId(null);
    }
  };

  const handleRepost = async (postId: string) => {
    setRepostingPostId(postId);
    try {
      const res = await client.v1.repost.$post({
        json: { postId },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Refresh the timeline to show the repost
        fetchData(undefined);
      } else if ('error' in result) {
        console.error('Failed to repost:', result.error);
        alert(`Failed to repost: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to repost:', error);
      alert('Failed to repost. Please try again.');
    } finally {
      setRepostingPostId(null);
    }
  };

  const handleUndoRepost = async (postId: string) => {
    if (!confirm('Are you sure you want to undo this repost?')) {
      return;
    }
    setUndoingRepostPostId(postId);
    try {
      const res = await client.v1.repost.$delete({
        json: { postId },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Refresh the timeline to remove the repost
        fetchData(undefined);
      } else if ('error' in result) {
        console.error('Failed to undo repost:', result.error);
        alert(`Failed to undo repost: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to undo repost:', error);
      alert('Failed to undo repost. Please try again.');
    } finally {
      setUndoingRepostPostId(null);
    }
  };

  const handleDelete = async (postId: string) => {
    setDeletingPostId(postId);
    try {
      const res = await client.v1.posts[':postId'].$delete({
        param: { postId },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Remove the timeline item from the local state
        if (data && !('error' in data)) {
          setData({
            ...data,
            timelineItems: data.timelineItems.filter(
              (item) => item.post.postId !== postId,
            ),
          });
        }
      } else if ('error' in result) {
        console.error('Failed to delete:', result.error);
        alert(`Failed to delete: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete the post. Please try again.');
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleEmojiReact = async (postId: string, emoji: string) => {
    setEmojiReactingPostId(postId);
    try {
      const res = await client.v1.react.$post({
        json: { postId, emoji },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Add the reaction to local state
        setMyReactions((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(postId) ?? [];
          if (!existing.includes(emoji)) {
            newMap.set(postId, [...existing, emoji]);
          }
          return newMap;
        });
      } else if ('error' in result) {
        console.error('Failed to react:', result.error);
        alert(`Failed to react: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to react:', error);
      alert('Failed to add reaction. Please try again.');
    } finally {
      setEmojiReactingPostId(null);
    }
  };

  const handleUndoEmojiReact = async (postId: string, emoji: string) => {
    setEmojiReactingPostId(postId);
    try {
      const res = await client.v1.react.$delete({
        json: { postId, emoji },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Remove the reaction from local state
        setMyReactions((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(postId) ?? [];
          newMap.set(
            postId,
            existing.filter((e) => e !== emoji),
          );
          return newMap;
        });
      } else if ('error' in result) {
        console.error('Failed to undo react:', result.error);
        alert(`Failed to undo reaction: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to undo react:', error);
      alert('Failed to remove reaction. Please try again.');
    } finally {
      setEmojiReactingPostId(null);
    }
  };

  const handleReply = (postId: string) => {
    setReplyingToPostId(postId);
  };

  const handleCancelReply = () => {
    setReplyingToPostId(null);
  };

  const handleSendReply = async (postId: string, content: string) => {
    setIsSendingReply(true);
    try {
      const res = await client.v1.reply.$post({
        json: { postId, content },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Refresh the timeline to show the new reply
        fetchData(undefined);
        setReplyingToPostId(null);
      } else if ('error' in result) {
        console.error('Failed to send reply:', result.error);
        alert(`Failed to send reply: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
      alert('Failed to send reply. Please try again.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleShowThread = async (postId: string) => {
    setThreadModalPostId(postId);
    setThreadData(null);
    setIsLoadingThread(true);
    try {
      const res = await client.v1.thread.$get({
        query: { postId },
      });
      const result = await res.json();
      if (
        'currentPost' in result
        && 'ancestors' in result
        && 'descendants' in result
      ) {
        setThreadData(
          result as {
            currentPost: PostWithAuthor | null;
            ancestors: PostWithAuthor[];
            descendants: PostWithAuthor[];
          },
        );
      } else if ('error' in result) {
        console.error('Failed to load thread:', result.error);
      }
    } catch (error) {
      console.error('Failed to load thread:', error);
    } finally {
      setIsLoadingThread(false);
    }
  };

  const handleCloseThread = () => {
    setThreadModalPostId(null);
    setThreadData(null);
  };

  useEffect(() => {
    if (!init) {
      setInit(true);
      fetchData(undefined);
    }
  }, [init]);
  if (data === null) {
    return <div>Loading...</div>;
  }
  if ('error' in data) {
    return <div>Error: {data.error}</div>;
  }
  return (
    <HomePage
      user={data.user}
      actor={data.actor}
      timelineItems={data.timelineItems}
      followers={data.followers}
      following={data.following}
      fetchData={fetchData}
      onRefresh={refreshData}
      isRefreshing={isRefreshing}
      onLike={handleLike}
      likingPostId={likingPostId}
      onUndoLike={handleUndoLike}
      undoingLikePostId={undoingLikePostId}
      onRepost={handleRepost}
      repostingPostId={repostingPostId}
      onUndoRepost={handleUndoRepost}
      undoingRepostPostId={undoingRepostPostId}
      onDelete={handleDelete}
      deletingPostId={deletingPostId}
      onEmojiReact={handleEmojiReact}
      onUndoEmojiReact={handleUndoEmojiReact}
      emojiReactingPostId={emojiReactingPostId}
      myReactions={myReactions}
      selectedIndex={selectedIndex}
      setSelectedIndex={setSelectedIndex}
      emojiPickerOpenForIndex={emojiPickerOpenForIndex}
      setEmojiPickerOpenForIndex={setEmojiPickerOpenForIndex}
      onReply={handleReply}
      replyingToPostId={replyingToPostId}
      onSendReply={handleSendReply}
      onCancelReply={handleCancelReply}
      isSendingReply={isSendingReply}
      onShowThread={handleShowThread}
      threadModalPostId={threadModalPostId}
      threadData={threadData}
      isLoadingThread={isLoadingThread}
      onCloseThread={handleCloseThread}
    />
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
