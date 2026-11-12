import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import {
  createStatus,
  deleteStatus,
  fetchStatus,
  fetchStatusContext,
  fetchVerifyCredentials,
} from '../api/mastodonClient.ts';
import { accountHref, displayStatus, isLocalAccount } from '../api/status.ts';
import { DEFAULT_POST_DESTINATION } from '../components/postDestination.ts';
import { replyParams } from '../components/postSubmission.ts';
import { PostView } from '../components/PostView.tsx';
import { ReplyModal } from '../components/ReplyModal.tsx';
import { resolveLocalPostThread } from './localPostThread.ts';

type ThreadData = {
  ancestors: readonly Status[];
  currentPost: Status | null;
  descendants: readonly Status[];
};

const getIsLoggedIn = (): boolean => {
  const root = document.getElementById('root');
  return root?.dataset.isLoggedIn === 'true';
};

const LocalPostPage = () => {
  const [threadData, setThreadData] = useState<ThreadData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextFailed, setContextFailed] = useState(false);
  const [isRetryingContext, setIsRetryingContext] = useState(false);
  const [isLoggedIn] = useState(() => getIsLoggedIn());
  const [currentAccountId, setCurrentAccountId] = useState<string | undefined>(undefined);

  const [replyToPostId, setReplyToPostId] = useState<string | null>(null);
  const [replyDestination, setReplyDestination] = useState<PostDestination>(DEFAULT_POST_DESTINATION);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const getPostIdFromUrl = () => {
    const pathParts = window.location.pathname.split('/');
    const postsIndex = pathParts.indexOf('posts');
    return pathParts[postsIndex + 1];
  };

  const fetchThread = async () => {
    const postId = getPostIdFromUrl();
    if (!postId) {
      setError('Post ID not found');
      setIsLoading(false);
      return;
    }

    const [status, context] = await Promise.allSettled([
      fetchStatus(postId),
      fetchStatusContext(postId),
    ]);
    const thread = resolveLocalPostThread(status, context);
    switch (thread.type) {
      case 'notFound':
        setThreadData(null);
        break;
      case 'error':
        setError(thread.message);
        break;
      case 'loaded':
        setThreadData({
          currentPost: thread.currentPost,
          ancestors: thread.ancestors,
          descendants: thread.descendants,
        });
        setContextFailed(thread.contextFailed);
        break;
    }
    setIsLoading(false);
  };

  const handleRetryContext = async () => {
    const postId = getPostIdFromUrl();
    if (!postId) return;

    setIsRetryingContext(true);
    try {
      const context = await fetchStatusContext(postId);
      setThreadData((prev) => prev && { ...prev, ancestors: context.ancestors, descendants: context.descendants });
      setContextFailed(false);
    } catch {
      setContextFailed(true);
    } finally {
      setIsRetryingContext(false);
    }
  };

  useEffect(() => {
    fetchThread();
    if (isLoggedIn) {
      fetchVerifyCredentials()
        .then((account) => setCurrentAccountId(account.id))
        .catch((err) => console.error('Failed to load the current account:', err));
    }
  }, []);

  const handleReply = (postId: string) => {
    setReplyToPostId(postId);
  };

  const handleCloseReplyModal = () => {
    setReplyToPostId(null);
  };

  const getReplyToPost = (): Status | undefined => {
    if (!replyToPostId || !threadData) return undefined;
    if (threadData.currentPost?.id === replyToPostId) {
      return threadData.currentPost;
    }
    const ancestor = threadData.ancestors.find((p) => p.id === replyToPostId);
    if (ancestor) return ancestor;
    return threadData.descendants.find((p) => p.id === replyToPostId);
  };

  const handleSubmitReply = async (content: string) => {
    if (!replyToPostId || !content.trim()) return;

    setIsSendingReply(true);
    try {
      await createStatus(replyParams(replyToPostId, content, replyDestination));
      setReplyToPostId(null);
      setReplyDestination(DEFAULT_POST_DESTINATION);
      fetchThread();
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
      await deleteStatus(postId);
      // If the deleted post is the current post, navigate back to user page
      if (threadData?.currentPost?.id === postId) {
        window.location.href = accountHref(displayStatus(threadData.currentPost).account);
      } else {
        // Otherwise, refresh the thread
        fetchThread();
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
      <div class='text-center py-8'>
        <p class='text-charcoal-light dark:text-gray-400 mb-4'>Post not found</p>
        <a
          href='/'
          class='text-terracotta hover:text-terracotta-dark transition-colors'
        >
          ホームに戻る
        </a>
      </div>
    );
  }

  const focusedPost = threadData.currentPost === null ? undefined : displayStatus(threadData.currentPost);
  const originalPostUrl = focusedPost === undefined || isLocalAccount(focusedPost.account)
    ? undefined
    : focusedPost.url ?? undefined;

  return (
    <div class='flex flex-col h-full'>
      {/* Header */}
      <div class='flex items-center justify-between mb-4 flex-shrink-0'>
        {focusedPost && (
          <a
            href={accountHref(focusedPost.account)}
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
            @{focusedPost.account.acct}
          </a>
        )}
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
                <div key={post.id} class='relative'>
                  <PostView
                    status={post}
                    onReply={isLoggedIn ? handleReply : undefined}
                    onDelete={isLoggedIn ? handleDelete : undefined}
                    isDeleting={deletingPostId === post.id}
                    currentAccountId={currentAccountId}
                    isLoggedIn={isLoggedIn}
                  />
                </div>
              ))}
            </>
          )}
          {threadData.currentPost && (
            <div class='relative'>
              <PostView
                status={threadData.currentPost}
                onReply={isLoggedIn ? handleReply : undefined}
                onDelete={isLoggedIn ? handleDelete : undefined}
                isDeleting={deletingPostId === threadData.currentPost.id}
                currentAccountId={currentAccountId}
                isLoggedIn={isLoggedIn}
              />
              {originalPostUrl && (
                <a
                  href={originalPostUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  class='mt-2 inline-block text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
                >
                  元の投稿を開く
                </a>
              )}
            </div>
          )}
          {contextFailed && (
            <div class='flex flex-wrap items-center gap-3'>
              <p role='alert' class='text-charcoal-light dark:text-gray-400'>返信とスレッドを読み込めませんでした。</p>
              <button
                type='button'
                onClick={handleRetryContext}
                disabled={isRetryingContext}
                class='px-4 py-2 bg-sage-dark hover:bg-sage disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
              >
                もう一度読み込む
              </button>
            </div>
          )}
          {threadData.descendants.length > 0 && (
            <>
              {threadData.descendants.map((post) => (
                <div key={post.id} class='relative'>
                  <PostView
                    status={post}
                    onReply={isLoggedIn ? handleReply : undefined}
                    onDelete={isLoggedIn ? handleDelete : undefined}
                    isDeleting={deletingPostId === post.id}
                    currentAccountId={currentAccountId}
                    isLoggedIn={isLoggedIn}
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
          replyToUsername={replyToPost?.account.username}
          isSubmitting={isSendingReply}
          destination={replyDestination}
          onDestinationChange={setReplyDestination}
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
