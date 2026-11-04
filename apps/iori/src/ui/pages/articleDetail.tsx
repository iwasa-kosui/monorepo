import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Article } from '../../domain/article/article.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { PostView } from '../components/PostView.tsx';
import { postToStatus } from '../legacyConversion.ts';
import { buildDigestPublishConfirmMessage, type DigestPublishNotice } from './digestPublishConfirm.ts';

type ArticleData = {
  article: Article;
  thread: PostWithAuthor[];
  body?: { html: string };
  digest?: DigestPublishNotice;
};

const getIsLoggedIn = (): boolean => {
  const root = document.getElementById('root');
  return root?.dataset.isLoggedIn === 'true';
};

const ArticleDetailPage = () => {
  const [data, setData] = useState<ArticleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn] = useState(() => getIsLoggedIn());
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);

  const getArticleIdFromUrl = () => {
    const pathParts = window.location.pathname.split('/');
    const articlesIndex = pathParts.indexOf('articles');
    return pathParts[articlesIndex + 1];
  };

  const fetchArticle = async () => {
    const articleId = getArticleIdFromUrl();
    if (!articleId) {
      setError('Article ID not found');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/iori/v1/articles/${articleId}`);
      const result = await res.json();

      if ('error' in result) {
        setError(result.error);
      } else {
        setData(result);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchArticle();
  }, []);

  const handlePublish = async () => {
    if (!data) return;

    const confirmMessage = data.digest === undefined ? undefined : buildDigestPublishConfirmMessage(data.digest);
    if (confirmMessage !== undefined && !confirm(confirmMessage)) return;

    setIsPublishing(true);
    try {
      const res = await fetch(`/api/iori/v1/articles/${data.article.articleId}/publish`, {
        method: 'POST',
      });
      const result = await res.json();

      if ('error' in result) {
        alert(result.error);
      } else {
        setData((prev) => (prev ? { ...prev, article: result.article } : null));
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!data) return;

    setIsUnpublishing(true);
    try {
      const res = await fetch(`/api/iori/v1/articles/${data.article.articleId}/unpublish`, {
        method: 'POST',
      });
      const result = await res.json();

      if ('error' in result) {
        alert(result.error);
      } else {
        setData((prev) => (prev ? { ...prev, article: result.article } : null));
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsUnpublishing(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div class='flex items-center justify-center py-8'>
        <svg class='animate-spin h-8 w-8 text-terracotta' viewBox='0 0 24 24'>
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
      <div class='text-center py-8'>
        <p class='text-terracotta mb-4'>Error: {error}</p>
        <a
          href='/articles'
          class='text-terracotta hover:text-terracotta-dark transition-colors'
        >
          記事一覧に戻る
        </a>
      </div>
    );
  }

  if (!data) {
    return (
      <div class='text-center py-8'>
        <p class='text-charcoal-light dark:text-gray-400 mb-4'>記事が見つかりませんでした</p>
        <a
          href='/articles'
          class='text-terracotta hover:text-terracotta-dark transition-colors'
        >
          記事一覧に戻る
        </a>
      </div>
    );
  }

  const { article, thread, body } = data;

  return (
    <div class='flex flex-col h-full'>
      {/* Header */}
      <div class='flex items-center justify-between mb-4 flex-shrink-0'>
        <a
          href='/articles'
          class='text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors flex items-center gap-2'
        >
          <svg class='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M15 19l-7-7 7-7'
            />
          </svg>
          記事一覧
        </a>
        {isLoggedIn && (
          <div class='flex items-center gap-2'>
            {article.status === 'draft' || article.status === 'unpublished'
              ? (
                <button
                  type='button'
                  onClick={handlePublish}
                  disabled={isPublishing}
                  class='px-4 py-2 bg-sage-dark hover:bg-sage disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-sm'
                >
                  {isPublishing ? '公開中...' : '公開する'}
                </button>
              )
              : (
                <button
                  type='button'
                  onClick={handleUnpublish}
                  disabled={isUnpublishing}
                  class='px-4 py-2 bg-sand hover:bg-sand-light disabled:opacity-50 text-rust text-sm font-medium rounded-clay transition-all shadow-clay-sm'
                >
                  {isUnpublishing ? '処理中...' : '非公開にする'}
                </button>
              )}
          </div>
        )}
      </div>

      {/* Article Header */}
      <div class='mb-8'>
        <h1 class='text-3xl font-bold text-charcoal dark:text-white mb-3'>
          {article.title}
        </h1>
        <p class='text-charcoal-light dark:text-gray-400'>
          {article.publishedAt ? formatDate(article.publishedAt) : formatDate(article.createdAt)}
        </p>
      </div>

      {/* Thread Content */}
      <div class='flex-1'>
        {body !== undefined
          ? (
            <div
              class='text-charcoal dark:text-gray-200 prose dark:prose-invert max-w-none [&_a]:text-terracotta dark:[&_a]:text-terracotta-light hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_p]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:p-4 [&_code]:text-sm [&_pre_code]:bg-transparent'
              dangerouslySetInnerHTML={{ __html: body.html }}
            />
          )
          : thread.length === 0
          ? (
            <p class='text-charcoal-light dark:text-gray-400 text-center py-8'>
              スレッドが見つかりませんでした
            </p>
          )
          : (
            <div class='space-y-6 py-2'>
              {thread.map((post) => <PostView key={post.postId} status={postToStatus(post)} />)}
            </div>
          )}
      </div>
    </div>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<ArticleDetailPage />, root);
}
