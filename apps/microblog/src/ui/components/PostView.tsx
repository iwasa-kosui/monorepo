import { useRef, useState } from 'hono/jsx';

import { Instant } from '../../domain/instant/instant.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { EmojiPicker } from './EmojiPicker.tsx';

type Props = Readonly<{
  post: PostWithAuthor;
  repostedBy?: {
    username: string;
    logoUri?: string;
  };
  onLike?: (postId: PostId) => void;
  isLiking?: boolean;
  onUndoLike?: (postId: PostId) => void;
  isUndoingLike?: boolean;
  onRepost?: (postId: PostId) => void;
  isReposting?: boolean;
  onUndoRepost?: (postId: PostId) => void;
  isUndoingRepost?: boolean;
  onDelete?: (postId: PostId) => void;
  isDeleting?: boolean;
  onEmojiReact?: (postId: PostId, emoji: string) => void;
  onUndoEmojiReact?: (postId: PostId, emoji: string) => void;
  isEmojiReacting?: boolean;
  myReactions?: readonly string[];
  currentUserId?: UserId;
  isSelected?: boolean;
  dataIndex?: number;
  isEmojiPickerOpen?: boolean;
  onToggleEmojiPicker?: () => void;
  onReply?: (postId: PostId) => void;
  onShowThread?: (postId: PostId) => void;
}>;

export const PostView = (
  {
    post,
    repostedBy,
    onLike,
    isLiking,
    onUndoLike,
    isUndoingLike,
    onRepost,
    isReposting,
    onUndoRepost,
    isUndoingRepost,
    onDelete,
    isDeleting,
    onEmojiReact,
    onUndoEmojiReact,
    isEmojiReacting,
    myReactions = [],
    currentUserId,
    isSelected,
    dataIndex,
    isEmojiPickerOpen,
    onToggleEmojiPicker,
    onReply,
    onShowThread,
  }: Props,
) => {
  const isRemotePost = post.type === 'remote' && 'uri' in post;
  const isLocalPost = post.type === 'local';
  const isOwner = isLocalPost && currentUserId && post.userId === currentUserId;
  const inReplyToUri = 'inReplyToUri' in post ? post.inReplyToUri : null;

  // Gesture states for like
  const [isFloating, setIsFloating] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const lastTapTime = useRef<number>(0);

  // Generate link to post detail page
  const postDetailLink = isLocalPost
    ? `/users/${post.username}/posts/${post.postId}`
    : isRemotePost
    ? post.uri
    : undefined;

  const triggerLike = () => {
    if (onLike && !post.liked && !isLiking) {
      setShowHeartAnimation(true);
      setIsFloating(true);
      onLike(post.postId);
      setTimeout(() => {
        setShowHeartAnimation(false);
        setIsFloating(false);
      }, 800);
    }
  };

  const handleLikeClick = () => {
    if (isLiking || isUndoingLike) return;

    if (post.liked) {
      // Undo like
      if (onUndoLike) {
        if (confirm('いいねを取り消しますか？')) {
          onUndoLike(post.postId);
        }
      }
    } else {
      // Like
      if (onLike) {
        onLike(post.postId);
      }
    }
  };

  const handleDeleteClick = () => {
    if (isOwner && onDelete && !isDeleting) {
      if (confirm('Are you sure you want to delete this post?')) {
        onDelete(post.postId);
      }
    }
  };

  const handleRepostClick = () => {
    if (isReposting || isUndoingRepost) return;

    if (post.reposted) {
      // Undo repost
      if (onUndoRepost) {
        if (confirm('リポストを取り消しますか？')) {
          onUndoRepost(post.postId);
        }
      }
    } else {
      // Repost
      if (onRepost) {
        if (confirm('リポストしますか？')) {
          onRepost(post.postId);
        }
      }
    }
  };

  // Touch handlers for swipe to like
  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (post.liked || isLiking) return;
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = Math.abs(touchEndY - touchStartY.current);

    // Swipe right detection (minimum 80px, mostly horizontal)
    if (deltaX > 80 && deltaY < 50) {
      triggerLike();
    }
  };

  // Double tap detection for like
  const handleClick = (e: MouseEvent) => {
    if (post.liked || isLiking) return;
    if (lastTapTime.current === null) return;

    const now = Date.now();
    const timeDiff = now - lastTapTime.current;

    if (timeDiff < 300 && timeDiff > 0) {
      e.preventDefault();
      triggerLike();
    }

    lastTapTime.current = now;
  };

  const canLike = onLike && !post.liked && !isLiking;

  return (
    <article
      data-post-index={dataIndex}
      class={`bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 transition-all duration-300 relative clay-hover-lift ${
        isFloating
          ? 'shadow-clay-hover dark:shadow-clay-dark-hover scale-[1.02] -translate-y-1'
          : 'hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover'
      } ${canLike ? 'cursor-pointer' : ''} ${
        isSelected ? 'ring-2 ring-terracotta/30 dark:ring-terracotta-light/30' : ''
      }`}
      onTouchStart={canLike ? handleTouchStart : undefined}
      onTouchEnd={canLike ? handleTouchEnd : undefined}
      onClick={canLike ? handleClick : undefined}
    >
      {/* Repost header */}
      {repostedBy && (
        <div class='flex items-center text-sm text-charcoal-light dark:text-gray-400 mb-3 pb-2 border-b border-warm-gray dark:border-gray-700'>
          <div class='flex items-center gap-2'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              class='h-4 w-4'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              stroke-width='2'
            >
              <path
                stroke-linecap='round'
                stroke-linejoin='round'
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
            <span>
              {repostedBy.username} がリポスト
            </span>
          </div>
        </div>
      )}
      {/* Heart animation overlay */}
      {showHeartAnimation && (
        <div class='absolute inset-0 flex items-center justify-center pointer-events-none z-10'>
          <svg
            class='w-20 h-20 text-pink-500 animate-ping'
            fill='currentColor'
            viewBox='0 0 24 24'
          >
            <path d='M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' />
          </svg>
        </div>
      )}
      <div class='flex flex-col gap-3'>
        <div class='flex-1 min-w-0'>
          <div class='flex items-center gap-2'>
            <a
              href={isLocalPost
                ? `/users/${post.username}`
                : isRemotePost
                ? `/remote-users/${post.actorId}`
                : undefined}
              class='w-8 h-8 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 shadow-clay-sm'
            >
              {post.logoUri
                ? (
                  <img
                    src={post.logoUri}
                    alt='Author Logo'
                    class='w-8 h-8 blob-avatar object-cover'
                  />
                )
                : (
                  String(post.username).charAt(0).toUpperCase()
                )}
            </a>
            <a
              href={isLocalPost
                ? `/users/${post.username}`
                : isRemotePost
                ? `/remote-users/${post.actorId}`
                : undefined}
              class='font-semibold text-charcoal dark:text-white hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
            >
              @{post.username}
            </a>
            <span class='text-warm-gray-dark dark:text-gray-500'>·</span>
            <a
              href={postDetailLink}
              target={isRemotePost ? '_blank' : undefined}
              rel={isRemotePost ? 'noopener noreferrer' : undefined}
              class='text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
              title={new Date(post.createdAt).toLocaleString()}
            >
              <time dateTime={new Date(post.createdAt).toISOString()}>
                {Instant.formatRelative(post.createdAt)}
              </time>
            </a>
          </div>
        </div>
        <div>
          <div
            class='mt-2 text-charcoal dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 break-words [&_blockquote]:border-l-4 [&_blockquote]:border-sand [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-charcoal-light dark:[&_blockquote]:border-gray-600 dark:[&_blockquote]:text-gray-400 [&_blockquote]:dark:mb-4 [&_p]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:p-4 [&_code]:text-sm [&_pre_code]:bg-transparent'
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
          {post.images && post.images.length > 0 && (
            <div
              class={`mt-3 grid gap-2 ${
                post.images.length === 1
                  ? 'grid-cols-1'
                  : post.images.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-2 md:grid-cols-3'
              }`}
            >
              {post.images.map((image, index) => (
                <a
                  key={index}
                  href={image.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  class='block overflow-hidden rounded-2xl'
                >
                  <img
                    src={image.url}
                    alt={image.altText || 'Post image'}
                    class='w-full h-auto max-h-80 object-cover hover:opacity-90 transition-opacity'
                    loading='lazy'
                  />
                </a>
              ))}
            </div>
          )}
          {/* Show thread link */}
          {onShowThread && inReplyToUri && (
            <div class='mt-2'>
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation();
                  onShowThread(post.postId);
                }}
                class='flex items-center gap-1 text-sm transition-colors text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  class='h-4 w-4'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  stroke-width='2'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
                  />
                </svg>
                このスレッドを表示
              </button>
            </div>
          )}
          <div class='mt-3 flex items-center justify-end gap-4'>
            {/* Reply button */}
            {onReply && (
              <button
                type='button'
                onClick={() => onReply(post.postId)}
                class='flex items-center gap-1 transition-colors text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light'
                title='Reply (p)'
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
                    d='M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6'
                  />
                </svg>
              </button>
            )}
            {
              <button
                type='button'
                onClick={handleRepostClick}
                class={`flex items-center gap-1 transition-colors ${
                  post.reposted
                    ? 'text-sage dark:text-sage'
                    : isReposting || isUndoingRepost
                    ? 'text-sage/50 dark:text-sage-dark cursor-wait'
                    : 'text-charcoal-light hover:text-sage dark:text-gray-400 dark:hover:text-sage'
                }`}
                title={isReposting
                  ? 'リポスト中...'
                  : isUndoingRepost
                  ? 'リポスト取り消し中...'
                  : post.reposted
                  ? 'リポストを取り消す'
                  : 'リポスト'}
                disabled={isReposting || isUndoingRepost}
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  class='h-5 w-5'
                  fill={post.reposted ? 'currentColor' : 'none'}
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  stroke-width='2'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                  />
                </svg>
              </button>
            }
            {
              <button
                type='button'
                onClick={handleLikeClick}
                class={`flex items-center gap-1 transition-colors ${
                  post.liked
                    ? 'text-terracotta dark:text-terracotta-light'
                    : isLiking || isUndoingLike
                    ? 'text-terracotta-light/50 dark:text-terracotta-dark cursor-wait'
                    : 'text-charcoal-light hover:text-terracotta dark:text-gray-400 dark:hover:text-terracotta-light'
                }`}
                title={isLiking
                  ? 'いいね中...'
                  : isUndoingLike
                  ? 'いいね取り消し中...'
                  : post.liked
                  ? 'いいねを取り消す'
                  : 'いいね'}
                disabled={isLiking || isUndoingLike}
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  class='h-5 w-5'
                  fill={post.liked ? 'currentColor' : 'none'}
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  stroke-width='2'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    d='M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z'
                  />
                </svg>
              </button>
            }
            {/* Emoji reaction button */}
            {onEmojiReact && (
              <div class='relative'>
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleEmojiPicker?.();
                  }}
                  class={`flex items-center gap-1 transition-colors ${
                    isEmojiReacting
                      ? 'text-sand/50 dark:text-sand-light cursor-wait'
                      : 'text-charcoal-light hover:text-sand dark:text-gray-400 dark:hover:text-sand-light'
                  }`}
                  title={isEmojiReacting ? 'Reacting...' : 'Add emoji reaction (e)'}
                  disabled={isEmojiReacting}
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
                      d='M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                    />
                  </svg>
                </button>
                <EmojiPicker
                  isOpen={isEmojiPickerOpen ?? false}
                  onClose={() => onToggleEmojiPicker?.()}
                  onSelect={(emoji) => {
                    onEmojiReact(post.postId, emoji);
                    onToggleEmojiPicker?.();
                  }}
                  isLoading={isEmojiReacting}
                />
              </div>
            )}
            {isOwner && (
              <button
                type='button'
                onClick={handleDeleteClick}
                class={`flex items-center gap-1 transition-colors ${
                  isDeleting
                    ? 'text-warm-gray-dark dark:text-gray-600 cursor-wait'
                    : 'text-charcoal-light hover:text-terracotta-dark dark:text-gray-400 dark:hover:text-terracotta'
                }`}
                title={isDeleting ? 'Deleting...' : 'Delete this post'}
                disabled={isDeleting}
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
                    d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
                  />
                </svg>
              </button>
            )}
          </div>
          {/* My reactions display */}
          {myReactions.length > 0 && (
            <div class='mt-2 flex flex-wrap items-center gap-1'>
              {myReactions.map((emoji) => (
                <button
                  key={emoji}
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onUndoEmojiReact) {
                      onUndoEmojiReact(post.postId, emoji);
                    }
                  }}
                  class='inline-flex items-center px-2 py-0.5 text-sm bg-sand-light dark:bg-gray-700 text-charcoal dark:text-gray-200 rounded-full hover:bg-terracotta-light/30 dark:hover:bg-terracotta-dark/30 hover:text-terracotta-dark dark:hover:text-terracotta-light transition-colors shadow-clay-sm'
                  title='Click to remove reaction'
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
