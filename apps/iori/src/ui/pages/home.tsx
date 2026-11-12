import type { Child } from 'hono/jsx';
import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { safeUrl } from '../../helper/safeUrl.ts';
import { fetchPublicTimeline, updateProfile } from '../api/mastodonClient.ts';
import { displayStatus, isOwnBoost } from '../api/status.ts';
import { ActorLink } from '../components/ActorLink.tsx';
import { BlueskyQuoteModal, BlueskyReplyModal } from '../components/BlueskyReplyModal.tsx';
import { BlueskyReportPostModal } from '../components/BlueskyReportPostModal.tsx';
import { BlueskyStatusNotice } from '../components/BlueskyStatusNotice.tsx';
import { BlueskyTimelineItemView } from '../components/BlueskyTimelineItemView.tsx';
import { EditPostModal } from '../components/EditPostModal.tsx';
import { MarkdownEditor } from '../components/MarkdownEditor.tsx';
import { Modal } from '../components/Modal.tsx';
import { PostDestinationSelect } from '../components/PostDestinationSelect.tsx';
import { PostForm } from '../components/PostForm.tsx';
import { PostView } from '../components/PostView.tsx';
import { isEmptyProfileUpdate, toProfileUpdate } from '../components/profileUpdate.ts';
import { QuoteModal } from '../components/QuoteModal.tsx';
import { ReplyDialogShell } from '../components/ReplyDialogShell.tsx';
import { ReportModal } from '../components/ReportModal.tsx';
import { UpdateProfileModal } from '../components/UpdateProfileModal.tsx';
import { TimelineProvider, useTimelineContext } from '../contexts/TimelineContext.tsx';
import { homeItemKey } from '../hooks/homeFeed.ts';
import { pullProgress, refreshResultLabel } from '../hooks/pullGesture.ts';
import { usePublicTimeline } from '../hooks/usePublicTimeline.ts';
import { ITEM_KEY_ATTRIBUTE } from '../hooks/useReadingPosition.ts';

const usePostedHandler = () => {
  const { timeline, ui } = useTimelineContext();
  return (status: Status) => {
    timeline.prependPost(status);
    ui.setSelectedIndex(-1);
    ui.setEmojiPickerOpenForIndex(null);
  };
};

const Spinner = ({ class: className = 'h-5 w-5' }: { class?: string }) => (
  <svg class={`animate-spin ${className}`} viewBox='0 0 24 24' aria-hidden='true'>
    <circle class='opacity-20' cx='12' cy='12' r='9' stroke='currentColor' stroke-width='2.5' fill='none' />
    <path
      class='opacity-80'
      d='M21 12a9 9 0 0 0-9-9'
      stroke='currentColor'
      stroke-width='2.5'
      stroke-linecap='round'
      fill='none'
    />
  </svg>
);

/** 引っ張り具合に合わせて円弧が伸び、しきい値を越えると矢印が反転するインジケーター。 */
const PullProgressIcon = ({ progress, isArmed }: { progress: number; isArmed: boolean }) => {
  const circumference = 2 * Math.PI * 9;
  return (
    <svg
      class='h-6 w-6'
      viewBox='0 0 24 24'
      aria-hidden='true'
      style={{ transform: `rotate(${progress * 270 - 90}deg)` }}
    >
      <circle cx='12' cy='12' r='9' stroke='currentColor' stroke-width='2.5' fill='none' class='opacity-20' />
      <circle
        cx='12'
        cy='12'
        r='9'
        stroke='currentColor'
        stroke-width='2.5'
        stroke-linecap='round'
        fill='none'
        stroke-dasharray={`${circumference}`}
        stroke-dashoffset={`${circumference * (1 - progress * 0.85)}`}
      />
      <path
        d='M12 8v8m0 0l-3-3m3 3l3-3'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
        fill='none'
        style={{
          transformOrigin: '12px 12px',
          transform: `rotate(${90 + (isArmed ? 180 : 0)}deg)`,
          transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)',
        }}
      />
    </svg>
  );
};

const REFRESHING_HEIGHT_PX = 56;

const PullToRefreshIndicator = () => {
  const { pullToRefresh } = useTimelineContext();
  const { pullDistance, phase, isArmed, resultCount } = pullToRefresh;
  const isDragging = phase === 'pulling';
  const height = isDragging ? pullDistance : phase === 'refreshing' || phase === 'done' ? REFRESHING_HEIGHT_PX : 0;
  const progress = pullProgress(pullDistance);

  return (
    <div
      class='flex items-end justify-center overflow-hidden'
      style={{
        height: `${height}px`,
        // 指に追従している間はアニメーションさせず、離したときだけなめらかに戻す
        transition: isDragging ? 'none' : 'height 380ms cubic-bezier(.2,.8,.2,1)',
      }}
      aria-live='polite'
    >
      <div
        class='flex h-14 items-center gap-2 text-terracotta dark:text-gray-300'
        style={{
          opacity: isDragging ? Math.max(0.15, progress) : 1,
          transform: isDragging ? `scale(${0.8 + progress * 0.2})` : 'scale(1)',
          transition: isDragging ? 'none' : 'opacity 200ms ease, transform 200ms ease',
        }}
      >
        {phase === 'refreshing'
          ? <Spinner class='h-6 w-6' />
          : phase === 'done'
          ? (
            <span class='text-sm font-medium text-charcoal-light dark:text-gray-400'>
              {refreshResultLabel(resultCount)}
            </span>
          )
          : <PullProgressIcon progress={progress} isArmed={isArmed} />}
      </div>
    </div>
  );
};

/** 読んでいる位置より上に新着が届いたことを知らせるボタン。押すと先頭までなめらかにスクロールする。 */
const NewPostsPill = () => {
  const { reading, data } = useTimelineContext();
  const count = reading.unseenKeys.size;
  const isVisible = count > 0;
  const avatars = data === null
    ? []
    : data.statuses
      .filter((status) => reading.unseenKeys.has(status.id))
      .slice(0, 3)
      .map((status) => status.account);

  return (
    <div
      class='pointer-events-none fixed inset-x-0 z-30 flex justify-center'
      style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
    >
      <button
        type='button'
        onClick={reading.scrollToTop}
        tabIndex={isVisible ? 0 : -1}
        aria-hidden={!isVisible}
        class='flex items-center gap-2 rounded-full bg-terracotta py-1.5 pl-2 pr-4 text-sm font-medium text-white shadow-clay-btn'
        style={{
          pointerEvents: isVisible ? 'auto' : 'none',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(-16px) scale(0.95)',
          transition: 'opacity 240ms ease, transform 320ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <svg class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' aria-hidden='true'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M12 19V5m0 0l-6 6m6-6l6 6' />
        </svg>
        {avatars.length > 0 && (
          <span class='flex -space-x-2'>
            {avatars.map((account) => (
              <img
                key={account.id}
                src={account.avatar}
                alt=''
                class='h-5 w-5 rounded-full border border-white/80 object-cover'
              />
            ))}
          </span>
        )}
        <span>{count}件の新しい投稿</span>
      </button>
    </div>
  );
};

const ReplyModal = () => {
  const { reply } = useTimelineContext();
  const {
    replyingToPostId,
    replyContent,
    replyDestination,
    isSendingReply,
    closeReplyDialog,
    setReplyContent,
    setReplyDestination,
    sendReply,
  } = reply;

  if (!replyingToPostId) {
    return null;
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (replyContent.trim() && replyingToPostId) {
        sendReply(replyingToPostId, replyContent);
      }
    }
  };

  return (
    <ReplyDialogShell
      onClose={closeReplyDialog}
      onSubmit={() => {
        if (replyContent.trim() && replyingToPostId) {
          sendReply(replyingToPostId, replyContent);
        }
      }}
      isSending={isSendingReply}
      canSubmit={!isSendingReply && replyContent.trim() !== ''}
      leadingActions={
        <PostDestinationSelect value={replyDestination} onChange={setReplyDestination} name='reply-destination' />
      }
    >
      <MarkdownEditor
        value={replyContent}
        onChange={setReplyContent}
        onKeyDown={handleKeyDown}
        placeholder='返信を書く... (⌘+Enter to post)'
        minHeight='150px'
        disabled={isSendingReply}
      />
    </ReplyDialogShell>
  );
};

const FediverseQuoteModal = () => {
  const { quote } = useTimelineContext();

  if (quote.target === null) {
    return null;
  }

  return (
    <QuoteModal
      target={quote.target}
      content={quote.content}
      destination={quote.destination}
      isSending={quote.isSending}
      errorText={quote.errorText}
      onClose={quote.close}
      onSubmit={() => void quote.send()}
      onContentChange={quote.setContent}
      onDestinationChange={quote.setDestination}
    />
  );
};

const FediverseEditModal = () => {
  const { edit } = useTimelineContext();

  if (edit.target === null) {
    return null;
  }

  return (
    <EditPostModal
      target={edit.target}
      loadState={edit.loadState}
      content={edit.content}
      cw={edit.cw}
      sensitive={edit.sensitive}
      isSending={edit.isSending}
      errorText={edit.errorText}
      onClose={edit.close}
      onSubmit={() => void edit.send()}
      onContentChange={edit.setContent}
      onCwChange={edit.setCw}
      onSensitiveChange={edit.setSensitive}
    />
  );
};

const ThreadModal = () => {
  const { thread, actions, reply, quote, edit, reportPost, data } = useTimelineContext();
  const {
    threadModalPostId,
    threadData,
    isLoadingThread,
    closeThread,
  } = thread;
  const {
    replyContent,
    replyDestination,
    isSendingReply,
    setReplyContent,
    setReplyDestination,
    sendReply,
  } = reply;
  const { actionState } = actions;
  const [threadEmojiPickerPostId, setThreadEmojiPickerPostId] = useState<string | null>(null);

  if (!threadModalPostId) {
    return null;
  }

  const currentAccountId = data?.me.id;
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
        <div class='flex-1 min-h-0 mb-4 overflow-y-auto'>
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
                      <div key={post.id} class='relative'>
                        <PostView
                          status={post}
                          currentAccountId={currentAccountId}
                          isLoggedIn
                          onReply={reply.openReplyDialog}
                          onQuote={quote.open}
                          onEdit={edit.open}
                          onLike={actions.like}
                          isLiking={actionState.likingPostId === post.id}
                          onUndoLike={actions.undoLike}
                          onBookmark={actions.bookmarkPost}
                          onUndoBookmark={actions.undoBookmarkPost}
                          isUndoingLike={actionState.undoingLikePostId === post.id}
                          onRepost={actions.repost}
                          isReposting={actionState.repostingPostId === post.id}
                          onUndoRepost={post.reblogged ? actions.undoRepost : undefined}
                          isUndoingRepost={actionState.undoingRepostPostId === post.id}
                          onDelete={actions.deletePost}
                          onMute={actions.muteAccount}
                          onBlock={actions.blockAccount}
                          onReport={reportPost.open}
                          isDeleting={actionState.deletingPostId === post.id}
                          onEmojiReact={actions.emojiReact}
                          onUndoEmojiReact={actions.undoEmojiReact}
                          isEmojiReacting={actionState.emojiReactingPostId === post.id}
                          myReactions={actionState.myReactions.get(post.id)}
                          isEmojiPickerOpen={threadEmojiPickerPostId === post.id}
                          onToggleEmojiPicker={() => toggleThreadEmojiPicker(post.id)}
                        />
                      </div>
                    ))}
                  </>
                )}
                {threadData.currentPost && (
                  <div class='relative'>
                    <PostView
                      status={threadData.currentPost}
                      currentAccountId={currentAccountId}
                      isLoggedIn
                      onReply={reply.openReplyDialog}
                      onQuote={quote.open}
                      onEdit={edit.open}
                      onLike={actions.like}
                      isLiking={actionState.likingPostId === threadData.currentPost.id}
                      onUndoLike={actions.undoLike}
                      onBookmark={actions.bookmarkPost}
                      onUndoBookmark={actions.undoBookmarkPost}
                      isUndoingLike={actionState.undoingLikePostId === threadData.currentPost.id}
                      onRepost={actions.repost}
                      isReposting={actionState.repostingPostId === threadData.currentPost.id}
                      onUndoRepost={threadData.currentPost.reblogged ? actions.undoRepost : undefined}
                      isUndoingRepost={actionState.undoingRepostPostId === threadData.currentPost.id}
                      onDelete={actions.deletePost}
                      onMute={actions.muteAccount}
                      onBlock={actions.blockAccount}
                      onReport={reportPost.open}
                      isDeleting={actionState.deletingPostId === threadData.currentPost.id}
                      onEmojiReact={actions.emojiReact}
                      onUndoEmojiReact={actions.undoEmojiReact}
                      isEmojiReacting={actionState.emojiReactingPostId === threadData.currentPost.id}
                      myReactions={actionState.myReactions.get(threadData.currentPost.id)}
                      isEmojiPickerOpen={threadEmojiPickerPostId === threadData.currentPost.id}
                      onToggleEmojiPicker={() => toggleThreadEmojiPicker(threadData.currentPost!.id)}
                    />
                  </div>
                )}
                {threadData.descendants.length > 0
                  ? (
                    <>
                      {threadData.descendants.map((post) => (
                        <div key={post.id} class='relative'>
                          <PostView
                            status={post}
                            currentAccountId={currentAccountId}
                            isLoggedIn
                            onReply={reply.openReplyDialog}
                            onQuote={quote.open}
                            onEdit={edit.open}
                            onLike={actions.like}
                            isLiking={actionState.likingPostId === post.id}
                            onUndoLike={actions.undoLike}
                            onBookmark={actions.bookmarkPost}
                            onUndoBookmark={actions.undoBookmarkPost}
                            isUndoingLike={actionState.undoingLikePostId === post.id}
                            onRepost={actions.repost}
                            isReposting={actionState.repostingPostId === post.id}
                            onUndoRepost={post.reblogged ? actions.undoRepost : undefined}
                            isUndoingRepost={actionState.undoingRepostPostId === post.id}
                            onDelete={actions.deletePost}
                            onMute={actions.muteAccount}
                            onBlock={actions.blockAccount}
                            onReport={reportPost.open}
                            isDeleting={actionState.deletingPostId === post.id}
                            onEmojiReact={actions.emojiReact}
                            onUndoEmojiReact={actions.undoEmojiReact}
                            isEmojiReacting={actionState.emojiReactingPostId === post.id}
                            myReactions={actionState.myReactions.get(post.id)}
                            isEmojiPickerOpen={threadEmojiPickerPostId === post.id}
                            onToggleEmojiPicker={() => toggleThreadEmojiPicker(post.id)}
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
            <PostDestinationSelect
              value={replyDestination}
              onChange={setReplyDestination}
              name='thread-reply-destination'
            />
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
  const handlePosted = usePostedHandler();

  if (!data) return null;

  const { me, followers, following, statuses } = data;
  const url = new URL(me.uri);
  const handle = `@${me.username}@${url.host}`;

  const logoUrl = safeUrl(me.avatar);

  return (
    <section class='hidden md:block mb-8'>
      <header class='mb-4'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white'>
          Hi, {me.username}
        </h1>
      </header>
      <section class='mb-8'>
        <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover blob-bg'>
          <div class='flex items-center gap-4 mb-4 relative z-10'>
            <a href='#update-bio' class='relative group flex-shrink-0'>
              <div class='w-16 h-16 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-2xl font-bold shadow-clay-sm'>
                {logoUrl
                  ? (
                    <img
                      src={logoUrl}
                      alt='User Logo'
                      class='w-16 h-16 blob-avatar object-cover'
                    />
                  )
                  : (
                    me.username.charAt(0).toUpperCase()
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
                {me.display_name}
              </h1>
              <p class='text-charcoal-light dark:text-gray-400'>{handle}</p>
            </div>
          </div>
          {me.source.note !== '' && (
            <p class='text-charcoal dark:text-gray-200 text-sm whitespace-pre-wrap mb-4 relative z-10'>
              {me.source.note}
            </p>
          )}

          <div class='flex gap-6 text-sm'>
            <div>
              <span class='font-semibold text-charcoal dark:text-white'>
                {me.followers_count}
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
                {me.following_count}
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
                {statuses.length}
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
                  {followers.map((follower) => <ActorLink key={follower.id} account={follower} />)}
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
                  {following.map((followed) => <ActorLink key={followed.id} account={followed} />)}
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

      <PostForm id='post' onPosted={handlePosted} />
    </section>
  );
};

const UpdateBioModal = () => {
  const { data, timeline } = useTimelineContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);

  if (!data) return null;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const update = toProfileUpdate(new FormData(e.currentTarget as HTMLFormElement), {
      displayName: data.me.display_name,
      note: data.me.source.note,
    });
    if (isEmptyProfileUpdate(update)) {
      window.location.hash = '';
      return;
    }
    setIsSubmitting(true);
    setErrorText(undefined);
    try {
      timeline.updateMe(await updateProfile(update));
      window.location.hash = '';
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <UpdateProfileModal
      displayName={data.me.display_name}
      note={data.me.source.note}
      isSubmitting={isSubmitting}
      errorText={errorText}
      onSubmit={handleSubmit}
    />
  );
};

const TimelineList = () => {
  const {
    data,
    items,
    actions,
    reportPost,
    blueskyLike,
    blueskyRepost,
    blueskyBookmark,
    blueskyReply,
    blueskyQuote,
    blueskyModeration,
    blueskyStatus,
    reply,
    quote,
    edit,
    thread,
    ui,
    reading,
    timeline,
  } = useTimelineContext();

  if (!data) return null;

  const { me } = data;
  const { actionState } = actions;
  const { selectedIndex, emojiPickerOpenForIndex, toggleEmojiPicker } = ui;

  let enteringOrder = 0;
  const wrap = (key: string, child: Child) => {
    const isEntering = reading.enteringKeys.has(key);
    const delay = isEntering ? Math.min(enteringOrder++, 8) * 40 : 0;
    return (
      <div
        key={key}
        {...{ [ITEM_KEY_ATTRIBUTE]: key }}
        style={isEntering ? { animation: `iori-timeline-enter 420ms cubic-bezier(.2,.8,.2,1) ${delay}ms both` } : {}}
      >
        {child}
      </div>
    );
  };

  const hasMore = data.nextMaxId !== undefined || data.bluesky.cursor !== undefined;

  return (
    <section class='space-y-6 py-2'>
      <style>
        {`@keyframes iori-timeline-enter {
          from { opacity: 0; transform: translateY(-12px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          [${ITEM_KEY_ATTRIBUTE}] { animation: none !important; }
        }`}
      </style>
      <BlueskyStatusNotice
        status={blueskyStatus.status}
        page='home'
        clientLoadFailed={timeline.blueskyLoadFailed}
      />
      {items.map((item, index) => {
        if (item.kind === 'bluesky') {
          return wrap(
            homeItemKey(item),
            <BlueskyTimelineItemView
              key={homeItemKey(item)}
              item={item.item}
              dataIndex={index}
              isSelected={selectedIndex === index}
              onReply={blueskyReply.open}
              onQuote={blueskyQuote.open}
              onLike={blueskyLike.like}
              onUndoLike={blueskyLike.undoLike}
              isLikePending={blueskyLike.pendingUris.has(item.item.uri)}
              onRepost={blueskyRepost.repost}
              onUndoRepost={blueskyRepost.undoRepost}
              isRepostPending={blueskyRepost.pendingUris.has(item.item.uri)}
              onBookmark={blueskyBookmark.bookmark}
              onUndoBookmark={blueskyBookmark.unbookmark}
              onMuteThread={blueskyModeration.onMuteThread}
              onUnmuteThread={blueskyModeration.onUnmuteThread}
              onMuteAuthor={blueskyModeration.onMuteAuthor}
              onBlockAuthor={blueskyModeration.onBlockAuthor}
              onReportPost={blueskyModeration.onReportPost}
            />,
          );
        }
        const { status } = item;
        const postId = displayStatus(status).id;
        const isMyRepost = isOwnBoost(status, me.id);

        return wrap(
          homeItemKey(item),
          <PostView
            status={status}
            onLike={actions.like}
            isLiking={actionState.likingPostId === postId}
            onUndoLike={actions.undoLike}
            onBookmark={actions.bookmarkPost}
            onUndoBookmark={actions.undoBookmarkPost}
            isUndoingLike={actionState.undoingLikePostId === postId}
            onRepost={actions.repost}
            isReposting={actionState.repostingPostId === postId}
            onUndoRepost={isMyRepost ? actions.undoRepost : undefined}
            isUndoingRepost={actionState.undoingRepostPostId === postId}
            onDelete={actions.deletePost}
            onMute={actions.muteAccount}
            onBlock={actions.blockAccount}
            onReport={reportPost.open}
            isDeleting={actionState.deletingPostId === postId}
            onEmojiReact={actions.emojiReact}
            onUndoEmojiReact={actions.undoEmojiReact}
            isEmojiReacting={actionState.emojiReactingPostId === postId}
            myReactions={actionState.myReactions.get(postId)}
            currentAccountId={me.id}
            isLoggedIn
            isSelected={selectedIndex === index}
            dataIndex={index}
            isEmojiPickerOpen={emojiPickerOpenForIndex === index}
            onToggleEmojiPicker={() => toggleEmojiPicker(index)}
            onReply={reply.openReplyDialog}
            onQuote={quote.open}
            onEdit={edit.open}
            onShowThread={thread.showThread}
          />,
        );
      })}
      {hasMore && (
        <div
          class='flex justify-center py-6 text-charcoal-light dark:text-gray-500'
          aria-hidden={!timeline.isLoadingMore}
        >
          <span style={{ opacity: timeline.isLoadingMore ? 1 : 0, transition: 'opacity 200ms ease' }}>
            <Spinner />
          </span>
        </div>
      )}
    </section>
  );
};

const ServerTimeline = () => {
  const { items: posts, setFirstPage } = usePublicTimeline('local');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const page = await fetchPublicTimeline('local');
        setFirstPage(page);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    };
    fetchPosts();
  }, []);

  if (isLoading) {
    return (
      <div class='flex items-center justify-center py-8'>
        <svg class='animate-spin h-8 w-8 text-terracotta' viewBox='0 0 24 24'>
          <circle class='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' stroke-width='4' fill='none' />
          <path
            class='opacity-75'
            fill='currentColor'
            d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
          />
        </svg>
      </div>
    );
  }

  return (
    <section class='space-y-6 py-2'>
      <div class='flex items-center justify-between mb-2'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white'>
          blog.kosui.me
        </h1>
        <div class='flex items-center gap-4'>
          <a
            href='/about'
            class='text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
          >
            ioriについて
          </a>
          <a
            href='/sign-in'
            class='text-sm text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-terracotta transition-colors'
          >
            Sign in
          </a>
        </div>
      </div>
      {posts.length > 0
        ? (
          posts.map((post) => <PostView key={post.id} status={post} />)
        )
        : (
          <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 text-center'>
            <p class='text-charcoal-light dark:text-gray-400'>まだ投稿がありません</p>
          </div>
        )}
    </section>
  );
};

const ReportPostModal = () => {
  const { reportPost } = useTimelineContext();

  return (
    <>
      <ReportModal
        targetLabel={reportPost.target === null ? '' : `@${reportPost.target.acct} の投稿`}
        isOpen={reportPost.target !== null}
        isSubmitting={reportPost.isReporting}
        error={reportPost.error}
        onSubmit={reportPost.submit}
        onClose={reportPost.close}
      />
      {reportPost.isReported && (
        <p
          role='status'
          class='fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-clay bg-cream dark:bg-gray-800 shadow-clay dark:shadow-clay-dark text-sm text-sage-dark dark:text-sage'
        >
          通報しました
        </p>
      )}
    </>
  );
};

const HomePage = () => {
  const { timeline, blueskyReply, blueskyQuote, blueskyModeration } = useTimelineContext();
  const handlePosted = usePostedHandler();
  const isTimelineReady = timeline.state.status === 'success';

  useEffect(() => {
    if (!isTimelineReady || window.location.hash !== '#post-modal') return;
    if (document.getElementById('post-modal') === null) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.location.replace('#post-modal');
  }, [isTimelineReady]);

  if (timeline.state.status === 'loading') {
    return <div>Loading...</div>;
  }

  if (timeline.state.status === 'error') {
    return <ServerTimeline />;
  }

  return (
    <>
      <UserProfile />
      <Modal id='post-modal' showCloseButton={false} fullScreen>
        <PostForm
          formId='post-modal-form'
          onPosted={(status) => {
            handlePosted(status);
            if (window.location.hash === '#post-modal') window.location.replace('#');
          }}
        />
      </Modal>
      <UpdateBioModal />
      <PullToRefreshIndicator />
      <NewPostsPill />
      <ReplyModal />
      <BlueskyReplyModal dialog={blueskyReply} />
      <BlueskyQuoteModal dialog={blueskyQuote} />
      <ThreadModal />
      <FediverseQuoteModal />
      <FediverseEditModal />
      <ReportPostModal />
      <BlueskyReportPostModal reportDialog={blueskyModeration.reportDialog} notice={blueskyModeration.notice} />
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
