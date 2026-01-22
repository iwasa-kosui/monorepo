import { hc } from 'hono/client';
import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { PostView } from '../components/PostView.tsx';

const client = hc<APIRouterType>('/api');

type TabMode = 'markdown' | 'preview';

type ThreadData = {
  ancestors: PostWithAuthor[];
  currentPost: PostWithAuthor | null;
  descendants: PostWithAuthor[];
};

const getIsLoggedIn = (): boolean => {
  const root = document.getElementById('root');
  return root?.dataset.isLoggedIn === 'true';
};

const LocalPostPage = () => {
  const [threadData, setThreadData] = useState<ThreadData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn] = useState(() => getIsLoggedIn());

  const [activeTab, setActiveTab] = useState<TabMode>('markdown');
  const [replyContent, setReplyContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

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

  const handleContentChange = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    const value = target.value;
    setReplyContent(value);

    if (
      typeof window !== 'undefined'
      && (window as unknown as { marked?: { parse: (text: string, options?: { async: boolean }) => string } }).marked
    ) {
      const rawHtml =
        (window as unknown as { marked: { parse: (text: string, options?: { async: boolean }) => string } }).marked
          .parse(value, { async: false });
      setPreviewHtml(rawHtml);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (replyContent.trim() && threadData?.currentPost?.postId) {
        sendReply();
      }
    }
  };

  const sendReply = async () => {
    if (!threadData?.currentPost?.postId || !replyContent.trim()) return;

    setIsSendingReply(true);
    try {
      const res = await client.v1.reply.$post({
        json: {
          postId: threadData.currentPost.postId,
          content: replyContent,
          imageUrls: [],
        },
      });
      const data = await res.json();

      if ('error' in data) {
        alert(data.error);
      } else {
        setReplyContent('');
        setPreviewHtml('');
        fetchThread();
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsSendingReply(false);
    }
  };

  const username = getUsernameFromUrl();

  const handleReply = (postId: string) => {
    if (threadData?.currentPost?.postId === postId) {
      // If replying to the current post, focus on the reply form
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      // If replying to another post in the thread, navigate to that post's page
      const pathParts = window.location.pathname.split('/');
      const usersIndex = pathParts.indexOf('users');
      const postUsername = pathParts[usersIndex + 1];
      window.location.href = `/users/${postUsername}/posts/${postId}`;
    }
  };

  if (isLoading) {
    return (
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
      <div class='text-gray-500 dark:text-gray-400 text-center py-8'>
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
          class='text-lg font-semibold text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2'
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
          class='text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors'
        >
          ホーム
        </a>
      </div>

      {/* Thread Content - Scrollable */}
      <div class='flex-1 overflow-y-auto min-h-0 mb-4'>
        <div class='space-y-3'>
          {threadData.ancestors.length > 0 && (
            <>
              {threadData.ancestors.map((post) => (
                <div key={post.postId} class='relative'>
                  <PostView post={post} onReply={isLoggedIn ? handleReply : undefined} />
                </div>
              ))}
            </>
          )}
          {threadData.currentPost && (
            <div class='relative'>
              <PostView post={threadData.currentPost} onReply={isLoggedIn ? handleReply : undefined} />
            </div>
          )}
          {threadData.descendants.length > 0 && (
            <>
              {threadData.descendants.map((post) => (
                <div key={post.postId} class='relative'>
                  <PostView post={post} onReply={isLoggedIn ? handleReply : undefined} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Reply Form - Fixed at bottom (only shown for logged-in users) */}
      {isLoggedIn && (
        <div class='flex-shrink-0 border-t border-gray-200 dark:border-gray-700 pt-4'>
          {/* Tab Bar */}
          <div class='flex gap-1 mb-3'>
            <button
              type='button'
              onClick={() => setActiveTab('markdown')}
              class={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                activeTab === 'markdown'
                  ? 'bg-gray-700 dark:bg-gray-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Markdown
            </button>
            <button
              type='button'
              onClick={() => setActiveTab('preview')}
              class={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                activeTab === 'preview'
                  ? 'bg-gray-700 dark:bg-gray-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Preview
            </button>
          </div>

          {/* Content Area */}
          {activeTab === 'markdown'
            ? (
              <textarea
                value={replyContent}
                onInput={handleContentChange}
                onKeyDown={handleKeyDown}
                placeholder='返信を書く... (⌘+Enter to post)'
                class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none'
                rows={4}
                disabled={isSendingReply}
              />
            )
            : (
              <div class='min-h-[100px] px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700'>
                {previewHtml
                  ? (
                    <div
                      class='text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5'
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  )
                  : (
                    <p class='text-gray-400 dark:text-gray-500'>
                      Nothing to preview
                    </p>
                  )}
              </div>
            )}

          {/* Action Button */}
          <div class='mt-3 flex justify-end'>
            <button
              type='button'
              onClick={sendReply}
              class={`px-5 py-2 text-white text-sm font-medium rounded-2xl transition-colors ${
                isSendingReply || !replyContent.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              disabled={isSendingReply || !replyContent.trim()}
            >
              {isSendingReply ? '送信中...' : '返信する'}
            </button>
          </div>
        </div>
      )}

      {isLoggedIn && <script src='https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js'></script>}
    </div>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<LocalPostPage />, root);
}
