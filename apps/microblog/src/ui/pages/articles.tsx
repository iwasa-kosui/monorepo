import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Article } from '../../domain/article/article.ts';

type ArticleWithStatus = Article & {
  isPublishing?: boolean;
  isUnpublishing?: boolean;
  isDeleting?: boolean;
};

const getIsLoggedIn = (): boolean => {
  const root = document.getElementById('root');
  return root?.dataset.isLoggedIn === 'true';
};

const ArticlesPage = () => {
  const [articles, setArticles] = useState<ArticleWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn] = useState(() => getIsLoggedIn());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newArticlePostId, setNewArticlePostId] = useState('');
  const [newArticleTitle, setNewArticleTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchArticles = async () => {
    try {
      const res = await fetch('/api/v1/articles');
      const data = await res.json();

      if ('error' in data) {
        setError(data.error);
      } else {
        setArticles(data.articles as ArticleWithStatus[]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const handlePublish = async (articleId: string) => {
    setArticles((prev) => prev.map((a) => (a.articleId === articleId ? { ...a, isPublishing: true } : a)));

    try {
      const res = await fetch(`/api/v1/articles/${articleId}/publish`, {
        method: 'POST',
      });
      const data = await res.json();

      if ('error' in data) {
        alert(data.error);
      } else {
        setArticles((prev) =>
          prev.map((a) =>
            a.articleId === articleId
              ? { ...data.article, isPublishing: false }
              : a
          )
        );
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setArticles((prev) => prev.map((a) => a.articleId === articleId ? { ...a, isPublishing: false } : a));
    }
  };

  const handleUnpublish = async (articleId: string) => {
    setArticles((prev) => prev.map((a) => a.articleId === articleId ? { ...a, isUnpublishing: true } : a));

    try {
      const res = await fetch(`/api/v1/articles/${articleId}/unpublish`, {
        method: 'POST',
      });
      const data = await res.json();

      if ('error' in data) {
        alert(data.error);
      } else {
        setArticles((prev) =>
          prev.map((a) =>
            a.articleId === articleId
              ? { ...data.article, isUnpublishing: false }
              : a
          )
        );
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setArticles((prev) => prev.map((a) => a.articleId === articleId ? { ...a, isUnpublishing: false } : a));
    }
  };

  const handleDelete = async (articleId: string) => {
    if (!confirm('この記事を削除しますか？')) {
      return;
    }

    setArticles((prev) => prev.map((a) => (a.articleId === articleId ? { ...a, isDeleting: true } : a)));

    try {
      const res = await fetch(`/api/v1/articles/${articleId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if ('error' in data) {
        alert(data.error);
      } else {
        setArticles((prev) => prev.filter((a) => a.articleId !== articleId));
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setArticles((prev) => prev.map((a) => a.articleId === articleId ? { ...a, isDeleting: false } : a));
    }
  };

  const handleCreateArticle = async () => {
    if (!newArticlePostId.trim() || !newArticleTitle.trim()) {
      setCreateError('投稿IDとタイトルを入力してください');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/v1/articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rootPostId: newArticlePostId.trim(),
          title: newArticleTitle.trim(),
        }),
      });
      const data = await res.json();

      if ('error' in data) {
        setCreateError(data.error);
      } else {
        setArticles((prev) => [data.article as ArticleWithStatus, ...prev]);
        setShowCreateModal(false);
        setNewArticlePostId('');
        setNewArticleTitle('');
      }
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setIsCreating(false);
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

  const getStatusBadge = (status: Article['status']) => {
    switch (status) {
      case 'draft':
        return (
          <span class='px-2 py-1 text-xs font-medium rounded-full bg-warm-gray dark:bg-gray-700 text-charcoal-light dark:text-gray-400'>
            下書き
          </span>
        );
      case 'published':
        return (
          <span class='px-2 py-1 text-xs font-medium rounded-full bg-sage/30 dark:bg-sage-dark/30 text-sage-dark dark:text-sage'>
            公開中
          </span>
        );
      case 'unpublished':
        return (
          <span class='px-2 py-1 text-xs font-medium rounded-full bg-sand dark:bg-sand/30 text-rust dark:text-sand'>
            非公開
          </span>
        );
    }
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
      <div class='text-red-500 text-center py-8'>
        Error: {error}
      </div>
    );
  }

  return (
    <div class='flex flex-col h-full'>
      {/* Header */}
      <div class='flex items-center justify-between mb-6 flex-shrink-0'>
        <h1 class='text-xl font-semibold text-charcoal dark:text-white'>
          記事
        </h1>
        {isLoggedIn && (
          <button
            type='button'
            onClick={() => setShowCreateModal(true)}
            class='px-4 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98] flex items-center gap-2'
          >
            <svg class='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 4v16m8-8H4' />
            </svg>
            新規作成
          </button>
        )}
      </div>

      {/* Articles List */}
      {(() => {
        const displayArticles = isLoggedIn ? articles : articles.filter((a) => a.status === 'published');

        if (displayArticles.length === 0) {
          return (
            <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
              <div class='w-16 h-16 mx-auto mb-4 rounded-clay bg-sand-light dark:bg-gray-700 flex items-center justify-center shadow-clay-sm'>
                <svg
                  class='w-8 h-8 text-charcoal-light dark:text-gray-500'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='1.5'
                    d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
                  />
                </svg>
              </div>
              <p class='text-charcoal-light dark:text-gray-400'>
                {isLoggedIn ? 'まだ記事がありません' : '公開中の記事がありません'}
              </p>
              {isLoggedIn && (
                <p class='text-warm-gray-dark dark:text-gray-500 text-sm mt-1'>
                  投稿とそのスレッドを記事として公開できます
                </p>
              )}
            </div>
          );
        }

        // Non-logged-in users: card view without admin buttons
        if (!isLoggedIn) {
          return (
            <div class='space-y-6'>
              {displayArticles.map((article) => (
                <a
                  key={article.articleId}
                  href={`/articles/${article.articleId}`}
                  class='block bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover transition-all'
                >
                  <h2 class='text-xl font-semibold text-charcoal dark:text-white mb-2'>
                    {article.title}
                  </h2>
                  <p class='text-sm text-charcoal-light dark:text-gray-400'>
                    {article.publishedAt && formatDate(article.publishedAt)}
                  </p>
                </a>
              ))}
            </div>
          );
        }

        // Logged-in users: full admin view
        return (
          <div class='space-y-4'>
            {displayArticles.map((article) => (
              <div
                key={article.articleId}
                class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover transition-all'
              >
                <div class='flex items-start justify-between gap-4'>
                  <div class='flex-1 min-w-0'>
                    <div class='flex items-center gap-2 mb-2'>
                      {getStatusBadge(article.status)}
                      {article.publishedAt && (
                        <span class='text-xs text-charcoal-light dark:text-gray-400'>
                          {formatDate(article.publishedAt)}に公開
                        </span>
                      )}
                    </div>
                    <a
                      href={`/articles/${article.articleId}`}
                      class='text-lg font-medium text-charcoal dark:text-white truncate hover:text-terracotta dark:hover:text-terracotta-light transition-colors block'
                    >
                      {article.title}
                    </a>
                    <p class='text-sm text-charcoal-light dark:text-gray-400 mt-1'>
                      作成: {formatDate(article.createdAt)}
                    </p>
                  </div>
                  <div class='flex items-center gap-2 flex-shrink-0'>
                    {article.status === 'draft' || article.status === 'unpublished'
                      ? (
                        <button
                          type='button'
                          onClick={() => handlePublish(article.articleId)}
                          disabled={article.isPublishing}
                          class='px-3 py-1.5 bg-sage-dark hover:bg-sage disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all shadow-clay-sm'
                        >
                          {article.isPublishing ? '公開中...' : '公開'}
                        </button>
                      )
                      : (
                        <button
                          type='button'
                          onClick={() => handleUnpublish(article.articleId)}
                          disabled={article.isUnpublishing}
                          class='px-3 py-1.5 bg-sand hover:bg-sand-light disabled:opacity-50 text-rust text-sm font-medium rounded-xl transition-all shadow-clay-sm'
                        >
                          {article.isUnpublishing ? '処理中...' : '非公開'}
                        </button>
                      )}
                    <button
                      type='button'
                      onClick={() => handleDelete(article.articleId)}
                      disabled={article.isDeleting}
                      class='px-3 py-1.5 bg-terracotta hover:bg-terracotta-dark disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all shadow-clay-sm'
                    >
                      {article.isDeleting ? '削除中...' : '削除'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Create Modal */}
      {isLoggedIn && showCreateModal && (
        <div
          class='fixed inset-0 bg-charcoal/50 backdrop-blur-sm flex items-center justify-center z-50'
          onClick={() => setShowCreateModal(false)}
        >
          <div
            class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md mx-4'
            onClick={(e) => e.stopPropagation()}
          >
            <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-4'>
              新しい記事を作成
            </h2>

            {createError && (
              <div class='mb-4 p-3 bg-terracotta-light/30 dark:bg-terracotta-dark/30 text-terracotta-dark dark:text-terracotta-light rounded-xl text-sm'>
                {createError}
              </div>
            )}

            <div class='space-y-4'>
              <div>
                <label class='block text-sm font-medium text-charcoal dark:text-gray-300 mb-1'>
                  投稿ID
                </label>
                <input
                  type='text'
                  value={newArticlePostId}
                  onInput={(e) => setNewArticlePostId((e.target as HTMLInputElement).value)}
                  placeholder='スレッドのルート投稿のID'
                  class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset'
                />
                <p class='text-xs text-charcoal-light dark:text-gray-400 mt-1'>
                  投稿URLの最後の部分（UUID）を入力してください
                </p>
              </div>

              <div>
                <label class='block text-sm font-medium text-charcoal dark:text-gray-300 mb-1'>
                  タイトル
                </label>
                <input
                  type='text'
                  value={newArticleTitle}
                  onInput={(e) => setNewArticleTitle((e.target as HTMLInputElement).value)}
                  placeholder='記事のタイトル'
                  maxLength={200}
                  class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset'
                />
              </div>
            </div>

            <div class='flex gap-2 justify-end mt-6'>
              <button
                type='button'
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError(null);
                }}
                class='px-4 py-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'
                disabled={isCreating}
              >
                キャンセル
              </button>
              <button
                type='button'
                onClick={handleCreateArticle}
                class={`px-5 py-2 text-white text-sm font-medium rounded-clay transition-all ${
                  isCreating || !newArticlePostId.trim() || !newArticleTitle.trim()
                    ? 'bg-warm-gray-dark cursor-not-allowed'
                    : 'bg-terracotta hover:bg-terracotta-dark shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
                }`}
                disabled={isCreating || !newArticlePostId.trim() || !newArticleTitle.trim()}
              >
                {isCreating ? '作成中...' : '作成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<ArticlesPage />, root);
}
