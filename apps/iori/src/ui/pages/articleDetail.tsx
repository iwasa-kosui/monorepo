import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Article } from '../../domain/article/article.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { MarkdownEditor } from '../components/MarkdownEditor.tsx';
import { PostView } from '../components/PostView.tsx';
import { postToStatus } from '../legacyConversion.ts';
import { buildDigestPublishConfirmMessage, type DigestPublishNotice } from './digestPublishConfirm.ts';

type DigestFeedbackValue = 'interested' | 'not_interested';

type DigestFeedbackItem = {
  digestItemId: string;
  rank: number;
  url: string;
  title: string;
  feedback: DigestFeedbackValue | null;
};

type ArticleData = {
  article: Article;
  thread: PostWithAuthor[];
  body?: { html: string; updatedAt: number };
  digest?: Omit<DigestPublishNotice, 'items'> & { items: DigestFeedbackItem[] };
};

type DeepDiveMessage = { digestItemId: string; text: string; isError: boolean };

const DEEP_DIVE_INSTRUCTION_MAX_LENGTH = 200;

const feedbackButtons: ReadonlyArray<Readonly<{ value: DigestFeedbackValue; label: string; pressedClass: string }>> = [
  { value: 'interested', label: '関心あり', pressedClass: 'bg-sage-dark hover:bg-sage text-white' },
  { value: 'not_interested', label: '関心なし', pressedClass: 'bg-rust hover:bg-rust text-white' },
];

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
  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editMarkdown, setEditMarkdown] = useState('');
  const [editBaseUpdatedAt, setEditBaseUpdatedAt] = useState(0);
  const [deepDiveItemId, setDeepDiveItemId] = useState<string | null>(null);
  const [deepDiveInstruction, setDeepDiveInstruction] = useState('');
  const [isDeepDiving, setIsDeepDiving] = useState(false);
  const [deepDiveMessage, setDeepDiveMessage] = useState<DeepDiveMessage | null>(null);

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

  const handleStartEdit = async () => {
    if (!data) return;

    setIsLoadingEdit(true);
    try {
      const res = await fetch(`/api/iori/v1/articles/${data.article.articleId}/edit`);
      const result = await res.json();

      if ('error' in result) {
        alert(result.error);
      } else {
        setEditTitle(result.title);
        setEditMarkdown(result.markdown);
        setEditBaseUpdatedAt(result.updatedAt);
        setIsEditing(true);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handleSave = async () => {
    if (!data) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/iori/v1/articles/${data.article.articleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, markdown: editMarkdown, baseUpdatedAt: editBaseUpdatedAt }),
      });
      const result = await res.json();

      if ('error' in result) {
        alert(result.error);
      } else {
        await fetchArticle();
        setIsEditing(false);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeepDive = async (digestItemId: string) => {
    if (!data || data.body === undefined) return;

    setIsDeepDiving(true);
    setDeepDiveMessage(null);
    try {
      const res = await fetch(`/api/iori/v1/digest-items/${digestItemId}/deep-dive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: deepDiveInstruction, baseUpdatedAt: data.body.updatedAt }),
      });
      if (res.status === 504) {
        await fetchArticle();
        setDeepDiveMessage({
          digestItemId,
          text: '時間がかかったため、結果を確かめられませんでした。本文を読み込み直しました。',
          isError: true,
        });
        return;
      }
      const result = await res.json();

      if ('error' in result) {
        setDeepDiveMessage({ digestItemId, text: result.error, isError: true });
      } else {
        await fetchArticle();
        setDeepDiveInstruction('');
        setDeepDiveMessage({
          digestItemId,
          text: `この項目はあと ${result.turnsLeft} 往復、今日はあと ${result.dailyRemaining} 回新しく深掘りできます`,
          isError: false,
        });
      }
    } catch (err) {
      setDeepDiveMessage({ digestItemId, text: (err as Error).message, isError: true });
    } finally {
      setIsDeepDiving(false);
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
  const canEdit = isLoggedIn
    && (article.status === 'draft' || article.status === 'unpublished')
    && article.rootPostId === null
    && body !== undefined;

  if (isEditing) {
    return (
      <div class='flex flex-col h-full'>
        <div class='flex items-center justify-between mb-4 flex-shrink-0'>
          <h1 class='text-xl font-bold text-charcoal dark:text-white'>記事を編集する</h1>
          <div class='flex items-center gap-2'>
            <button
              type='button'
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              class='px-4 py-2 bg-sand hover:bg-sand-light disabled:opacity-50 text-charcoal text-sm font-medium rounded-clay transition-all shadow-clay-sm'
            >
              キャンセル
            </button>
            <button
              type='button'
              onClick={handleSave}
              disabled={isSaving || editTitle.trim() === '' || editMarkdown.trim() === ''}
              class='px-4 py-2 bg-sage-dark hover:bg-sage disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-sm'
            >
              {isSaving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
        <input
          type='text'
          value={editTitle}
          maxLength={200}
          disabled={isSaving}
          placeholder='タイトル'
          onInput={(e) => setEditTitle((e.target as HTMLInputElement).value)}
          class='w-full mb-4 px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset text-xl font-bold'
        />
        <MarkdownEditor
          value={editMarkdown}
          onChange={setEditMarkdown}
          disabled={isSaving}
          placeholder='本文を Markdown で書く'
          minHeight='400px'
        />
      </div>
    );
  }

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
            {canEdit && (
              <button
                type='button'
                onClick={handleStartEdit}
                disabled={isLoadingEdit}
                class='px-4 py-2 bg-sand hover:bg-sand-light disabled:opacity-50 text-charcoal text-sm font-medium rounded-clay transition-all shadow-clay-sm'
              >
                {isLoadingEdit ? '読み込み中...' : '編集する'}
              </button>
            )}
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

      {isLoggedIn && article.status !== 'published' && data.digest !== undefined && data.digest.items.length > 0 && (
        <div class='mt-8 flex-shrink-0'>
          <h2 class='text-xl font-bold text-charcoal dark:text-white mb-3'>この記事への反応</h2>
          <ul class='space-y-3'>
            {data.digest.items.map((item) => (
              <li key={item.digestItemId} class='flex flex-col gap-2'>
                <a
                  href={item.url}
                  class='text-terracotta dark:text-terracotta-light hover:underline break-all'
                >
                  {item.title}
                </a>
                <form
                  method='post'
                  action={`/api/iori/v1/digest-items/${item.digestItemId}/feedback`}
                  class='flex items-center gap-2'
                >
                  {feedbackButtons.map(({ value, label, pressedClass }) => (
                    <button
                      key={value}
                      type='submit'
                      name='feedback'
                      value={value}
                      aria-pressed={item.feedback === value ? 'true' : 'false'}
                      class={`px-3 py-1 text-sm font-medium rounded-clay transition-all shadow-clay-sm ${
                        item.feedback === value ? pressedClass : 'bg-sand hover:bg-sand-light text-charcoal'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type='button'
                    onClick={() => setDeepDiveItemId(deepDiveItemId === item.digestItemId ? null : item.digestItemId)}
                    disabled={isEditing || isDeepDiving || data.body === undefined}
                    aria-expanded={deepDiveItemId === item.digestItemId ? 'true' : 'false'}
                    class='px-3 py-1 text-sm font-medium rounded-clay transition-all shadow-clay-sm disabled:opacity-50 bg-sand hover:bg-sand-light text-charcoal'
                  >
                    深掘り
                  </button>
                </form>
                {deepDiveItemId === item.digestItemId && (
                  <div class='flex flex-col gap-2'>
                    <input
                      type='text'
                      value={deepDiveInstruction}
                      maxLength={DEEP_DIVE_INSTRUCTION_MAX_LENGTH}
                      disabled={isDeepDiving}
                      placeholder='依頼（任意）'
                      onInput={(e) => setDeepDiveInstruction((e.target as HTMLInputElement).value)}
                      class='w-full px-3 py-2 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset text-sm'
                    />
                    <div class='flex items-center gap-2'>
                      <button
                        type='button'
                        onClick={() => handleDeepDive(item.digestItemId)}
                        disabled={isEditing || isDeepDiving}
                        class='px-3 py-1 text-sm font-medium rounded-clay transition-all shadow-clay-sm disabled:opacity-50 bg-sage-dark hover:bg-sage text-white'
                      >
                        依頼する
                      </button>
                      {isDeepDiving && (
                        <span class='text-sm text-charcoal-light dark:text-gray-400'>深掘りしています…</span>
                      )}
                    </div>
                  </div>
                )}
                {deepDiveMessage !== null && deepDiveMessage.digestItemId === item.digestItemId && (
                  <p
                    class={`text-sm ${
                      deepDiveMessage.isError ? 'text-terracotta' : 'text-charcoal-light dark:text-gray-400'
                    }`}
                  >
                    {deepDiveMessage.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<ArticleDetailPage />, root);
}
