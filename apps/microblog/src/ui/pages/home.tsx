import { useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import { ActorLink } from '../components/ActorLink.tsx';
import { MarkdownEditor } from '../components/MarkdownEditor.tsx';
import { Modal } from '../components/Modal.tsx';
import { PostForm } from '../components/PostForm.tsx';
import { PostView } from '../components/PostView.tsx';
import { TimelineProvider, useTimelineContext } from '../contexts/TimelineContext.tsx';

const PullToRefreshIndicator = () => {
  const { pullToRefresh, pullThreshold, timeline } = useTimelineContext();
  const { pullDistance } = pullToRefresh;
  const isRefreshing = timeline.isRefreshing;

  if (pullDistance <= 0 && !isRefreshing) {
    return null;
  }

  return (
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
  );
};

const ThreadModal = () => {
  const { thread, actions, reply, data } = useTimelineContext();
  const {
    threadModalPostId,
    threadData,
    isLoadingThread,
    closeThread,
  } = thread;
  const {
    replyContent,
    isSendingReply,
    setReplyContent,
    sendReply,
  } = reply;
  const { actionState } = actions;
  const [threadEmojiPickerPostId, setThreadEmojiPickerPostId] = useState<string | null>(null);

  if (!threadModalPostId) {
    return null;
  }

  const currentUserId = data?.user.id;
  const toggleThreadEmojiPicker = (postId: string) => {
    setThreadEmojiPickerPostId((prev) => (prev === postId ? null : postId));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (replyContent.trim() && threadModalPostId) {
        sendReply(threadModalPostId, replyContent);
      }
    }
  };

  return (
    <div
      class='fixed inset-0 bg-charcoal/50 backdrop-blur-sm flex items-center justify-center z-50'
      onClick={closeThread}
    >
      <div
        class='bg-cream dark:bg-gray-800 md:rounded-clay shadow-clay dark:shadow-clay-dark p-4 md:p-6 w-full h-full md:h-auto md:max-w-2xl md:max-h-[90vh] md:mx-4 flex flex-col'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class='flex items-center justify-between mb-4 flex-shrink-0'>
          <h2 class='text-lg font-semibold text-charcoal dark:text-white'>
            Thread
          </h2>
          <button
            type='button'
            onClick={closeThread}
            class='text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light transition-colors'
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

        {/* Thread Content */}
        <div class='flex-1 min-h-0 mb-4'>
          {isLoadingThread
            ? (
              <div class='flex items-center justify-center py-8'>
                <svg
                  class='animate-spin h-8 w-8 text-terracotta'
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
                {threadData.ancestors.length > 0 && (
                  <>
                    {threadData.ancestors.map((post) => (
                      <div key={post.postId} class='relative'>
                        <PostView
                          post={post}
                          currentUserId={currentUserId}
                          onReply={reply.openReplyDialog}
                          onLike={actions.like}
                          isLiking={actionState.likingPostId === post.postId}
                          onUndoLike={actions.undoLike}
                          isUndoingLike={actionState.undoingLikePostId === post.postId}
                          onRepost={actions.repost}
                          isReposting={actionState.repostingPostId === post.postId}
                          onUndoRepost={post.reposted ? actions.undoRepost : undefined}
                          isUndoingRepost={actionState.undoingRepostPostId === post.postId}
                          onDelete={actions.deletePost}
                          isDeleting={actionState.deletingPostId === post.postId}
                          onEmojiReact={actions.emojiReact}
                          onUndoEmojiReact={actions.undoEmojiReact}
                          isEmojiReacting={actionState.emojiReactingPostId === post.postId}
                          myReactions={actionState.myReactions.get(post.postId) ?? []}
                          isEmojiPickerOpen={threadEmojiPickerPostId === post.postId}
                          onToggleEmojiPicker={() => toggleThreadEmojiPicker(post.postId)}
                        />
                      </div>
                    ))}
                  </>
                )}
                {threadData.currentPost && (
                  <div class='relative'>
                    <PostView
                      post={threadData.currentPost}
                      currentUserId={currentUserId}
                      onReply={reply.openReplyDialog}
                      onLike={actions.like}
                      isLiking={actionState.likingPostId === threadData.currentPost.postId}
                      onUndoLike={actions.undoLike}
                      isUndoingLike={actionState.undoingLikePostId === threadData.currentPost.postId}
                      onRepost={actions.repost}
                      isReposting={actionState.repostingPostId === threadData.currentPost.postId}
                      onUndoRepost={threadData.currentPost.reposted ? actions.undoRepost : undefined}
                      isUndoingRepost={actionState.undoingRepostPostId === threadData.currentPost.postId}
                      onDelete={actions.deletePost}
                      isDeleting={actionState.deletingPostId === threadData.currentPost.postId}
                      onEmojiReact={actions.emojiReact}
                      onUndoEmojiReact={actions.undoEmojiReact}
                      isEmojiReacting={actionState.emojiReactingPostId === threadData.currentPost.postId}
                      myReactions={actionState.myReactions.get(threadData.currentPost.postId) ?? []}
                      isEmojiPickerOpen={threadEmojiPickerPostId === threadData.currentPost.postId}
                      onToggleEmojiPicker={() => toggleThreadEmojiPicker(threadData.currentPost!.postId)}
                    />
                  </div>
                )}
                {threadData.descendants.length > 0
                  ? (
                    <>
                      {threadData.descendants.map((post) => (
                        <div key={post.postId} class='relative'>
                          <PostView
                            post={post}
                            currentUserId={currentUserId}
                            onReply={reply.openReplyDialog}
                            onLike={actions.like}
                            isLiking={actionState.likingPostId === post.postId}
                            onUndoLike={actions.undoLike}
                            isUndoingLike={actionState.undoingLikePostId === post.postId}
                            onRepost={actions.repost}
                            isReposting={actionState.repostingPostId === post.postId}
                            onUndoRepost={post.reposted ? actions.undoRepost : undefined}
                            isUndoingRepost={actionState.undoingRepostPostId === post.postId}
                            onDelete={actions.deletePost}
                            isDeleting={actionState.deletingPostId === post.postId}
                            onEmojiReact={actions.emojiReact}
                            onUndoEmojiReact={actions.undoEmojiReact}
                            isEmojiReacting={actionState.emojiReactingPostId === post.postId}
                            myReactions={actionState.myReactions.get(post.postId) ?? []}
                            isEmojiPickerOpen={threadEmojiPickerPostId === post.postId}
                            onToggleEmojiPicker={() => toggleThreadEmojiPicker(post.postId)}
                          />
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

        {/* Reply Form - Fixed at bottom */}
        <div class='flex-shrink-0 border-t border-warm-gray dark:border-gray-700 pt-4'>
          <MarkdownEditor
            value={replyContent}
            onChange={setReplyContent}
            onKeyDown={handleKeyDown}
            placeholder='返信を書く... (⌘+Enter to post)'
            minHeight='100px'
            disabled={isSendingReply}
          />

          {/* Action Buttons */}
          <div class='mt-3 flex gap-2 justify-end'>
            <button
              type='button'
              onClick={closeThread}
              class='px-4 py-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'
              disabled={isSendingReply}
            >
              Cancel
            </button>
            <button
              type='button'
              onClick={() => {
                if (replyContent.trim() && threadModalPostId) {
                  sendReply(threadModalPostId, replyContent);
                }
              }}
              class={`px-5 py-2 text-white text-sm font-medium rounded-clay transition-all ${
                isSendingReply || !replyContent.trim()
                  ? 'bg-warm-gray-dark cursor-not-allowed'
                  : 'bg-terracotta hover:bg-terracotta-dark shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
              }`}
              disabled={isSendingReply || !replyContent.trim()}
            >
              {isSendingReply ? '送信中...' : '返信する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const UserProfile = () => {
  const { data } = useTimelineContext();

  if (!data) return null;

  const { user, actor, followers, following, timelineItems } = data;
  const url = new URL(actor.uri);
  const handle = `@${user.username}@${url.host}`;

  return (
    <section class='hidden md:block mb-8'>
      <header class='mb-4'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white'>
          Hi, {String(user.username)}
        </h1>
      </header>
      <section class='mb-8'>
        <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover blob-bg'>
          <div class='flex items-center gap-4 mb-4 relative z-10'>
            <a href='#update-bio' class='relative group flex-shrink-0'>
              <div class='w-16 h-16 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-2xl font-bold shadow-clay-sm'>
                {actor.logoUri
                  ? (
                    <img
                      src={actor.logoUri}
                      alt='User Logo'
                      class='w-16 h-16 blob-avatar object-cover'
                    />
                  )
                  : (
                    String(user.username).charAt(0).toUpperCase()
                  )}
              </div>
              <div class='absolute inset-0 rounded-full bg-charcoal/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity'>
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
              <h1 class='text-2xl font-bold text-charcoal dark:text-white'>
                {String(user.username)}
              </h1>
              <p class='text-charcoal-light dark:text-gray-400'>{handle}</p>
            </div>
          </div>

          <div class='flex gap-6 text-sm'>
            <div>
              <span class='font-semibold text-charcoal dark:text-white'>
                {followers.length}
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
                {following.length}
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
                {timelineItems.length}
              </span>
              <span class='text-charcoal-light dark:text-gray-400 ml-1'>Posts</span>
            </div>
          </div>
        </div>

        <div>
          <Modal id='followers'>
            <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-3'>
              Followers
            </h2>
            {followers.length > 0
              ? (
                <div class='space-y-1 max-h-48 overflow-y-auto'>
                  {followers.map((follower) => <ActorLink key={follower.id} actor={follower} />)}
                </div>
              )
              : (
                <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                  No followers yet
                </p>
              )}
          </Modal>

          <Modal id='following'>
            <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-3'>
              Following
            </h2>
            {following.length > 0
              ? (
                <div class='space-y-1 max-h-48 overflow-y-auto'>
                  {following.map((followed) => <ActorLink key={followed.id} actor={followed} />)}
                </div>
              )
              : (
                <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                  Not following anyone yet
                </p>
              )}
          </Modal>
        </div>
      </section>

      <PostForm id='post' />
    </section>
  );
};

const UpdateBioModal = () => {
  const { data } = useTimelineContext();

  if (!data) return null;

  const { user } = data;

  return (
    <Modal id='update-bio' showCloseButton={false}>
      <form method='post' action={`/users/${user.username}`}>
        <p class='text-charcoal-light dark:text-gray-400 text-sm mb-3'>
          Enter a URL for your profile image
        </p>
        <input
          type='url'
          name='logoUri'
          placeholder='https://example.com/image.png'
          class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset mb-3 transition-all'
        />
        <div class='flex gap-2 justify-end'>
          <a href='#'>
            <button
              type='button'
              class='px-4 py-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'
            >
              Cancel
            </button>
          </a>
          <button
            type='submit'
            class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
          >
            Update
          </button>
        </div>
      </form>
    </Modal>
  );
};

const TimelineList = () => {
  const { data, actions, reply, thread, ui } = useTimelineContext();

  if (!data) return null;

  const { user, actor, timelineItems } = data;
  const { actionState } = actions;
  const { selectedIndex, emojiPickerOpenForIndex, toggleEmojiPicker } = ui;

  return (
    <section class='space-y-6 py-2'>
      {timelineItems.map((item, index) => {
        const postId = item.post.postId;
        const isMyRepost = item.type === 'repost' && item.repostedBy.actorId === actor.id;
        return (
          <PostView
            key={item.timelineItemId}
            post={item.post}
            repostedBy={item.type === 'repost' ? item.repostedBy : undefined}
            onLike={actions.like}
            isLiking={actionState.likingPostId === postId}
            onUndoLike={actions.undoLike}
            isUndoingLike={actionState.undoingLikePostId === postId}
            onRepost={actions.repost}
            isReposting={actionState.repostingPostId === postId}
            onUndoRepost={isMyRepost ? actions.undoRepost : undefined}
            isUndoingRepost={actionState.undoingRepostPostId === postId}
            onDelete={actions.deletePost}
            isDeleting={actionState.deletingPostId === postId}
            onEmojiReact={actions.emojiReact}
            onUndoEmojiReact={actions.undoEmojiReact}
            isEmojiReacting={actionState.emojiReactingPostId === postId}
            myReactions={actionState.myReactions.get(postId) ?? []}
            currentUserId={user.id}
            isSelected={selectedIndex === index}
            dataIndex={index}
            isEmojiPickerOpen={emojiPickerOpenForIndex === index}
            onToggleEmojiPicker={() => toggleEmojiPicker(index)}
            onReply={reply.openReplyDialog}
            onShowThread={thread.showThread}
          />
        );
      })}
    </section>
  );
};

const HomePage = () => {
  const { timeline } = useTimelineContext();

  if (timeline.state.status === 'loading') {
    return <div>Loading...</div>;
  }

  if (timeline.state.status === 'error') {
    return <div>Error: {timeline.state.error}</div>;
  }

  return (
    <>
      <UserProfile />
      <Modal id='post-modal' showCloseButton={false} fullScreen>
        <PostForm formId='post-modal-form' />
      </Modal>
      <UpdateBioModal />
      <PullToRefreshIndicator />
      <ThreadModal />
      <TimelineList />
      <script src='https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js'></script>
    </>
  );
};

const App = () => {
  return (
    <TimelineProvider>
      <HomePage />
    </TimelineProvider>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
