import { useRef, useState } from 'hono/jsx';

import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { EmojiPicker } from './EmojiPicker.tsx';

type Props = Readonly<{
  post: PostWithAuthor;
  repostedBy?: {
    username: string;
    logoUri?: string;
  };
  onLike?: (objectUri: string) => void;
  isLiking?: boolean;
  onRepost?: (objectUri: string) => void;
  isReposting?: boolean;
  onDelete?: (postId: string) => void;
  isDeleting?: boolean;
  onEmojiReact?: (objectUri: string, emoji: string) => void;
  onUndoEmojiReact?: (objectUri: string, emoji: string) => void;
  isEmojiReacting?: boolean;
  myReactions?: readonly string[];
  currentUserId?: UserId;
  isSelected?: boolean;
  dataIndex?: number;
  isEmojiPickerOpen?: boolean;
  onToggleEmojiPicker?: () => void;
}>;

export const PostView = (
  {
    post,
    repostedBy,
    onLike,
    isLiking,
    onRepost,
    isReposting,
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
  }: Props,
) => {
  const isRemotePost = post.type === 'remote' && 'uri' in post;
  const isLocalPost = post.type === 'local';
  const isOwner = isLocalPost && currentUserId && post.userId === currentUserId;

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
    if (isRemotePost && onLike && !post.liked && !isLiking) {
      setShowHeartAnimation(true);
      setIsFloating(true);
      onLike(post.uri);
      setTimeout(() => {
        setShowHeartAnimation(false);
        setIsFloating(false);
      }, 800);
    }
  };

  const handleLikeClick = () => {
    if (isRemotePost && onLike && !post.liked && !isLiking) {
      onLike(post.uri);
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
    if (isRemotePost && onRepost && !isReposting) {
      onRepost(post.uri);
    }
  };

  // Touch handlers for swipe to like
  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (!isRemotePost || post.liked || isLiking) return;
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
    if (!isRemotePost || post.liked || isLiking) return;
    if (lastTapTime.current === null) return;

    const now = Date.now();
    const timeDiff = now - lastTapTime.current;

    if (timeDiff < 300 && timeDiff > 0) {
      e.preventDefault();
      triggerLike();
    }

    lastTapTime.current = now;
  };

  const canLike = isRemotePost && !post.liked && !isLiking;

  return (
    <article
      data-post-index={dataIndex}
      class={`bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 transition-all duration-300 relative overflow-hidden ${
        isFloating
          ? 'shadow-puffy dark:shadow-puffy-dark scale-[1.02] -translate-y-1'
          : 'hover:shadow-puffy dark:hover:shadow-puffy-dark'
      } ${canLike ? 'cursor-pointer' : ''} ${isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}
      onTouchStart={canLike ? handleTouchStart : undefined}
      onTouchEnd={canLike ? handleTouchEnd : undefined}
      onClick={canLike ? handleClick : undefined}
    >
      {/* Repost header */}
      {repostedBy && (
        <div class='flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3 pb-2 border-b border-gray-100 dark:border-gray-700'>
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
      <div class='flex items-start gap-3'>
        <a
          href={isLocalPost ? `/users/${post.username}` : isRemotePost ? `/remote-users/${post.actorId}` : undefined}
          class='w-11 h-11 rounded-2xl bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 font-semibold text-sm flex-shrink-0'
        >
          {post.logoUri
            ? (
              <img
                src={post.logoUri}
                alt='Author Logo'
                class='w-11 h-11 rounded-2xl object-cover'
              />
            )
            : (
              String(post.username).charAt(0).toUpperCase()
            )}
        </a>
        <div class='flex-1 min-w-0'>
          <div class='flex items-center gap-2'>
            <a
              href={isLocalPost
                ? `/users/${post.username}`
                : isRemotePost
                ? `/remote-users/${post.actorId}`
                : undefined}
              class='font-semibold text-gray-900 dark:text-white hover:underline'
            >
              @{post.username}
            </a>
            <span class='text-gray-400 dark:text-gray-500'>·</span>
            <a
              href={postDetailLink}
              target={isRemotePost ? '_blank' : undefined}
              rel={isRemotePost ? 'noopener noreferrer' : undefined}
              class='text-sm text-gray-500 dark:text-gray-400 hover:underline'
            >
              <time dateTime={new Date(post.createdAt).toISOString()}>
                {new Date(post.createdAt).toLocaleString()}
              </time>
            </a>
          </div>
          <div
            class='mt-2 text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 hover:[&_a]:underline  [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 break-words [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 dark:[&_blockquote]:border-gray-600 dark:[&_blockquote]:text-gray-400 [&_blockquote]:dark:mb-4'
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
          {/* My reactions display */}
          {myReactions.length > 0 && (
            <div class='mt-2 flex flex-wrap gap-1'>
              {myReactions.map((emoji) => (
                <button
                  key={emoji}
                  type='button'
                  onClick={() => {
                    if (isRemotePost && onUndoEmojiReact) {
                      onUndoEmojiReact(post.uri, emoji);
                    }
                  }}
                  class='px-2 py-0.5 text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full hover:bg-red-100 dark:hover:bg-red-900 hover:text-red-800 dark:hover:text-red-200 transition-colors'
                  title='Click to remove reaction'
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <div class='mt-3 flex items-center justify-end gap-4'>
            {isRemotePost && (
              <button
                type='button'
                onClick={handleRepostClick}
                class={`flex items-center gap-1 transition-colors ${
                  isReposting
                    ? 'text-green-300 dark:text-green-600 cursor-wait'
                    : 'text-gray-500 hover:text-green-500 dark:text-gray-400 dark:hover:text-green-400'
                }`}
                title={isReposting ? 'Reposting...' : 'Repost'}
                disabled={isReposting}
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
                    d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                  />
                </svg>
              </button>
            )}
            {isRemotePost && (
              <button
                type='button'
                onClick={handleLikeClick}
                class={`flex items-center gap-1 transition-colors ${
                  post.liked
                    ? 'text-red-500 dark:text-red-400'
                    : isLiking
                    ? 'text-pink-300 dark:text-pink-600 cursor-wait'
                    : 'text-gray-500 hover:text-pink-500 dark:text-gray-400 dark:hover:text-pink-400'
                }`}
                title={post.liked ? 'Already liked' : isLiking ? 'Liking...' : 'Like this post'}
                disabled={post.liked || isLiking}
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
            )}
            {/* Emoji reaction button */}
            {isRemotePost && onEmojiReact && (
              <div class='relative'>
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleEmojiPicker?.();
                  }}
                  class={`flex items-center gap-1 transition-colors ${
                    isEmojiReacting
                      ? 'text-yellow-300 dark:text-yellow-600 cursor-wait'
                      : 'text-gray-500 hover:text-yellow-500 dark:text-gray-400 dark:hover:text-yellow-400'
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
                    if (isRemotePost) {
                      onEmojiReact(post.uri, emoji);
                      onToggleEmojiPicker?.();
                    }
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
                    ? 'text-gray-300 dark:text-gray-600 cursor-wait'
                    : 'text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400'
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
        </div>
      </div>
    </article>
  );
};
