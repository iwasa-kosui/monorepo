import { hc } from 'hono/client';
import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { PostView } from '../components/PostView.tsx';
import { ReplyModal } from '../components/ReplyModal.tsx';

const client = hc<APIRouterType>('/api');

type ThreadData = {
  ancestors: PostWithAuthor[];
  currentPost: PostWithAuthor | null;
  descendants: PostWithAuthor[];
};

const getIsLoggedIn = (): boolean => {
  const root = document.getElementById('root');
  return root?.dataset.isLoggedIn === 'true';
};

const getCurrentUserId = (): UserId | undefined => {
  const root = document.getElementById('root');
  const userId = root?.dataset.userId;
  return userId ? (userId as UserId) : undefined;
};

const LocalPostPage = () => {
  const [threadData, setThreadData] = useState<ThreadData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn] = useState(() => getIsLoggedIn());
  const [currentUserId] = useState(() => getCurrentUserId());

  const [replyToPostId, setReplyToPostId] = useState<string | null>(null);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const getPostIdFromUrl = () => {
    const pathParts = window.location.pathname.split('/');
    const postsIndex = pathParts.indexOf('posts');
    return pathParts[postsIndex + 1];
  };

  const getUsernameFromUrl = () => {
    const pathParts = window.location.pathname.split('/');
    const usersIndex = pathParts.indexOf('users');
    return pathParts[usersIndex + 1];
  };

  const fetchThread = async () => {
    const postId = getPostIdFromUrl();
    if (!postId) {
      setError('Post ID not found');
      setIsLoading(false);
      return;
    }

    try {
      const res = await client.v1.thread.$get({
        query: { postId },
      });
      const data = await res.json();

      if ('error' in data) {
        setError(data.error);
      } else {
        setThreadData(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();
  }, []);

  const username = getUsernameFromUrl();

  const handleReply = (postId: string) => {
    setReplyToPostId(postId);
  };

  const handleCloseReplyModal = () => {
    setReplyToPostId(null);
  };

  const getReplyToPost = (): PostWithAuthor | undefined => {
    if (!replyToPostId || !threadData) return undefined;
    if (threadData.currentPost?.postId === replyToPostId) {
      return threadData.currentPost;
    }
    const ancestor = threadData.ancestors.find((p) => p.postId === replyToPostId);
    if (ancestor) return ancestor;
    return threadData.descendants.find((p) => p.postId === replyToPostId);
  };

  const handleSubmitReply = async (content: string) => {
    if (!replyToPostId || !content.trim()) return;

    setIsSendingReply(true);
    try {
      const res = await client.v1.reply.$post({
        json: {
          postId: replyToPostId,
          content,
          imageUrls: [],
        },
      });
      const data = await res.json();

      if ('error' in data) {
        alert(data.error);
      } else {
        setReplyToPostId(null);
        fetchThread();
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsSendingReply(false);
    }
  };

  const replyToPost = getReplyToPost();

  const handleDelete = async (postId: string) => {
    if (!confirm('この投稿を削除しますか？')) return;

    setDeletingPostId(postId);
    try {
      const res = await client.v1.posts[':postId'].$delete({
        param: { postId },
      });
      const data = await res.json();

      if ('error' in data) {
        alert(data.error);
      } else {
        // If the deleted post is the current post, navigate back to user page
        if (threadData?.currentPost?.postId === postId) {
          window.location.href = `/users/${username}`;
        } else {
          // Otherwise, refresh the thread
          fetchThread();
        }
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeletingPostId(null);
    }
  };

  if (isLoading) {
    return (
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
    );
  }

  if (error) {
    return (
      <div class='text-red-500 text-center py-8'>
        Error: {error}
      </div>
    );
  }

  if (!threadData) {
    return (
      <div class='text-charcoal-light dark:text-gray-400 text-center py-8'>
        Post not found
      </div>
    );
  }

  return (
    <div class='flex flex-col h-full'>
      {/* Header */}
      <div class='flex items-center justify-between mb-4 flex-shrink-0'>
        <a
          href={`/users/${username}`}
          class='text-lg font-semibold text-charcoal dark:text-white hover:text-terracotta dark:hover:text-terracotta-light flex items-center gap-2 transition-colors'
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
              d='M15 19l-7-7 7-7'
            />
          </svg>
          @{username}
        </a>
        <a
          href='/'
          class='text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
        >
          ホーム
        </a>
      </div>

      {/* Thread Content */}
      <div class='flex-1 min-h-0 overflow-y-auto'>
        <div class='space-y-6 py-2'>
          {threadData.ancestors.length > 0 && (
            <>
              {threadData.ancestors.map((post) => (
                <div key={post.postId} class='relative'>
                  <PostView
                    post={post}
                    onReply={isLoggedIn ? handleReply : undefined}
                    onDelete={isLoggedIn ? handleDelete : undefined}
                    isDeleting={deletingPostId === post.postId}
                    currentUserId={currentUserId}
                  />
                </div>
              ))}
            </>
          )}
          {threadData.currentPost && (
            <div class='relative'>
              <PostView
                post={threadData.currentPost}
                onReply={isLoggedIn ? handleReply : undefined}
                onDelete={isLoggedIn ? handleDelete : undefined}
                isDeleting={deletingPostId === threadData.currentPost.postId}
                currentUserId={currentUserId}
              />
            </div>
          )}
          {threadData.descendants.length > 0 && (
            <>
              {threadData.descendants.map((post) => (
                <div key={post.postId} class='relative'>
                  <PostView
                    post={post}
                    onReply={isLoggedIn ? handleReply : undefined}
                    onDelete={isLoggedIn ? handleDelete : undefined}
                    isDeleting={deletingPostId === post.postId}
                    currentUserId={currentUserId}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Reply Modal */}
      {isLoggedIn && (
        <ReplyModal
          isOpen={replyToPostId !== null}
          onClose={handleCloseReplyModal}
          onSubmit={handleSubmitReply}
          replyToUsername={replyToPost?.username}
          isSubmitting={isSendingReply}
        />
      )}

      {isLoggedIn && <script src='https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js'></script>}
    </div>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<LocalPostPage />, root);
}
