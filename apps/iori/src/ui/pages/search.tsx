import { useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import {
  isMastodonApiError,
  isUnauthorizedError,
  searchStatuses,
  type SearchStatusesResult,
  summarizeTimeline,
  type TimelineSummary,
} from '../api/mastodonClient.ts';
import { buildSummaryRequest, summaryErrorMessage, summaryResultLabel, summaryTargetLabel } from '../api/summary.ts';
import { PostView } from '../components/PostView.tsx';
import { SummaryText } from '../components/SummaryText.tsx';

const inputClass =
  'w-full rounded-clay bg-cream dark:bg-gray-800 shadow-clay-sm dark:shadow-clay-dark px-4 py-2 text-charcoal dark:text-gray-100';
const buttonClass =
  'rounded-clay bg-terracotta text-white px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';
const noticeClass = 'text-sm text-warm-gray-dark dark:text-gray-500';

const redirectToSignIn = () => {
  window.location.href = '/sign-in';
};

const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [searched, setSearched] = useState<SearchStatusesResult | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const isSearchingRef = useRef(false);
  const isSummarizingRef = useRef(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [summary, setSummary] = useState<{ result: TimelineSummary; target: string } | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const handleSearch = async (event: Event) => {
    event.preventDefault();
    if (isSearchingRef.current) return;
    const q = query.trim();
    if (q === '') {
      setSearched(null);
      setSearchedQuery('');
      setSearchError('検索語を入力してください。');
      return;
    }
    isSearchingRef.current = true;
    setIsSearching(true);
    setSearchError('');
    try {
      setSearched(await searchStatuses(q));
      setSearchedQuery(q);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        redirectToSignIn();
        return;
      }
      setSearched(null);
      setSearchedQuery('');
      setSearchError(
        error instanceof TypeError ? '通信に失敗しました。もう一度試してください。' : '検索に失敗しました。',
      );
    } finally {
      isSearchingRef.current = false;
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearched(null);
    setSearchedQuery('');
  };

  const handleSummarize = async () => {
    if (isSummarizingRef.current) return;
    const request = buildSummaryRequest({ query: searchedQuery, since, until });
    if (!request.ok) {
      setSummary(null);
      setSummaryError(request.message);
      return;
    }
    const target = searchedQuery.trim();
    isSummarizingRef.current = true;
    setIsSummarizing(true);
    setSummaryError('');
    try {
      setSummary({ result: await summarizeTimeline(request.body), target });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        redirectToSignIn();
        return;
      }
      setSummary(null);
      setSummaryError(
        isMastodonApiError(error)
          ? summaryErrorMessage(error.status, error.retryAfterSeconds, new Date())
          : summaryErrorMessage(undefined, undefined, new Date()),
      );
    } finally {
      isSummarizingRef.current = false;
      setIsSummarizing(false);
    }
  };

  return (
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>検索</h1>

      <form class='flex gap-2 mb-4' onSubmit={handleSearch}>
        <input
          type='search'
          class={inputClass}
          placeholder='検索語'
          value={query}
          onInput={(event: Event) => setQuery((event.target as HTMLInputElement).value)}
        />
        <button type='submit' class={buttonClass} disabled={isSearching}>検索</button>
      </form>

      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4 mb-6 space-y-3'>
        <h2 class='font-bold text-charcoal dark:text-white'>要約</h2>
        <div class='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          <label class='text-sm text-charcoal-light dark:text-gray-400'>
            開始（日本時間）
            <input
              type='datetime-local'
              class={inputClass}
              value={since}
              onInput={(event: Event) => setSince((event.target as HTMLInputElement).value)}
            />
          </label>
          <label class='text-sm text-charcoal-light dark:text-gray-400'>
            終了（日本時間）
            <input
              type='datetime-local'
              class={inputClass}
              value={until}
              onInput={(event: Event) => setUntil((event.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <p class='text-charcoal dark:text-gray-100'>{summaryTargetLabel(searchedQuery)}</p>
        {searchedQuery !== '' && (
          <button type='button' class={buttonClass} disabled={isSearching} onClick={handleClearSearch}>
            検索結果を消して期間の要約に戻る
          </button>
        )}
        <p class={noticeClass}>
          検索したあとに押すと、その検索の結果を要約します。期間の要約に戻すには、検索結果を消してください。期間は 7
          日以内です。
        </p>
        <button type='button' class={buttonClass} disabled={isSummarizing} onClick={handleSummarize}>
          {isSummarizing ? '要約しています' : '要約する'}
        </button>
        {summaryError !== '' && <p class='text-sm text-red-600 dark:text-red-400'>{summaryError}</p>}
        {summary !== null && (
          <div class='space-y-3'>
            <p class='text-charcoal dark:text-gray-100'>{summaryResultLabel(summary.target)}</p>
            {summary.result.summary === null
              ? <p class='text-charcoal-light dark:text-gray-400'>要約できる投稿がありません</p>
              : <SummaryText summary={summary.result.summary} citations={summary.result.citations} />}
            <p class={noticeClass}>今日の残り回数: {summary.result.remaining_today} 回</p>
            {summary.result.truncated && <p class={noticeClass}>投稿が多いため一部だけを要約しました</p>}
            {summary.result.excluded_non_public_count >= 1 && (
              <p class={noticeClass}>
                ダイレクトメッセージと公開範囲が不明な投稿 {summary.result.excluded_non_public_count}{' '}
                件は要約に含めていません
              </p>
            )}
            {summary.result.citations.length > 0 && (
              <ol class='space-y-4'>
                {summary.result.citations.map((citation) => (
                  <li key={citation.n}>
                    <p class={noticeClass}>[{citation.n}]</p>
                    <PostView status={citation.status} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {searchError !== '' && <p class='text-charcoal-light dark:text-gray-400 mb-4'>{searchError}</p>}
      {isSearching && <p class='text-charcoal-light dark:text-gray-400 mb-4'>検索しています</p>}
      {searched !== null && !isSearching && (
        <div class='space-y-6 py-2'>
          <div class={noticeClass}>
            <p>使った語: {[...searched.terms.original, ...searched.terms.expanded].join(' / ')}</p>
            {searched.expansion === 'failed' && <p>検索語の展開に失敗したため、入力した語だけで検索しました</p>}
          </div>
          {searched.statuses.length > 0
            ? searched.statuses.map((status) => <PostView key={status.id} status={status} />)
            : (
              <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
                <p class='text-charcoal-light dark:text-gray-400'>該当する投稿はありません</p>
              </div>
            )}
        </div>
      )}
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<SearchPage />, root);
}
