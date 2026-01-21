import { useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import { ActorLink } from '../components/ActorLink.tsx';
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

const ReplyModal = () => {
  const { reply } = useTimelineContext();
  const {
    replyingToPostId,
    replyContent,
    isSendingReply,
    closeReplyDialog,
    setReplyContent,
    sendReply,
  } = reply;

  if (!replyingToPostId) {
    return null;
  }

  return (
    <div
      class='fixed inset-0 bg-black/50 flex items-center justify-center z-50'
      onClick={closeReplyDialog}
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
            onClick={closeReplyDialog}
            class='px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'
            disabled={isSendingReply}
          >
            Cancel
          </button>
          <button
            type='button'
            onClick={() => {
              if (replyContent.trim()) {
                sendReply(replyingToPostId, replyContent);
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
  const { actionState } = actions;
  const [threadEmojiPickerPostId, setThreadEmojiPickerPostId] = useState<string | null>(null);

  if (!threadModalPostId) {
    return null;
  }

  const currentUserId = data?.user.id;
  const toggleThreadEmojiPicker = (postId: string) => {
    setThreadEmojiPickerPostId((prev) => (prev === postId ? null : postId));
  };

  return (
    <div
      class='fixed inset-0 bg-black/50 flex items-center justify-center z-50'
      onClick={closeThread}
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
            onClick={closeThread}
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
                <div class='relative ring-2 ring-blue-500 dark:ring-blue-400 rounded-3xl'>
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
  );
};

const UpdateBioModal = () => {
  const { data } = useTimelineContext();

  if (!data) return null;

  const { user } = data;

  return (
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
  );
};

const TimelineList = () => {
  const { data, actions, reply, thread, ui } = useTimelineContext();

  if (!data) return null;

  const { user, actor, timelineItems } = data;
  const { actionState } = actions;
  const { selectedIndex, emojiPickerOpenForIndex, toggleEmojiPicker } = ui;

  return (
    <section class='space-y-4'>
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
      <Modal id='post-modal' showCloseButton={false}>
        <PostForm formId='post-modal-form' />
      </Modal>
      <UpdateBioModal />
      <PullToRefreshIndicator />
      <ReplyModal />
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
