import { useEffect, useRef, useState } from 'hono/jsx';

import type { Account } from '../../adaptor/mastodon/entities.ts';
import { openFediverseConversation } from '../api/fediverseConversationClient.ts';
import { fetchVerifyCredentials, searchAccount, searchMentionCandidates } from '../api/mastodonClient.ts';
import {
  FEDIVERSE_ACTOR_NOT_FOUND_MESSAGE,
  fediverseChatPath,
  fediverseErrorMessageOf,
} from '../hooks/fediverseConversation.ts';
import {
  hasRecipientHandle,
  normalizeRecipientQuery,
  recipientCandidates,
  resolvableRecipientHandle,
} from '../hooks/fediverseRecipient.ts';
import { FediverseAccountRow } from './FediverseAccountRow.tsx';

const SEARCH_DELAY_MS = 500;
const SEARCH_FAILED_MESSAGE = '宛先を検索できませんでした。時間をおいてもう一度試してください。';

const mutedClass = 'text-charcoal-light dark:text-gray-400';

type SearchResult = Readonly<{ found: readonly Account[]; resolved: Account | undefined }>;

export const FediverseNewConversation = () => {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [selfAccountId, setSelfAccountId] = useState<string | undefined>(undefined);
  const isOpeningRef = useRef(false);
  const [pending] = useState<{ timer: ReturnType<typeof setTimeout> | null; seq: number }>(
    () => ({ timer: null, seq: 0 }),
  );

  const cancelSearch = () => {
    pending.seq += 1;
    if (pending.timer !== null) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
  };

  useEffect(() => cancelSearch, []);

  useEffect(() => {
    const load = async () => {
      try {
        setSelfAccountId((await fetchVerifyCredentials()).id);
      } catch (cause) {
        console.error('Failed to load the current account:', cause);
      }
    };
    void load();
  }, []);

  const search = (value: string) => {
    cancelSearch();
    setError(null);
    const query = normalizeRecipientQuery(value);
    if (query === '') {
      setResult(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const seq = pending.seq;
    pending.timer = setTimeout(() => {
      pending.timer = null;
      const run = async () => {
        try {
          const found = await searchMentionCandidates(query);
          const handle = resolvableRecipientHandle(query);
          const resolved = handle === undefined || hasRecipientHandle(found, handle)
            ? undefined
            : await searchAccount(handle);
          if (seq !== pending.seq) return;
          setResult({ found, resolved });
        } catch (cause) {
          if (seq !== pending.seq) return;
          console.error('Failed to search the Fediverse recipients:', cause);
          setResult(null);
          setError(SEARCH_FAILED_MESSAGE);
        }
        setIsSearching(false);
      };
      void run();
    }, SEARCH_DELAY_MS);
  };

  const open = async (account: Account) => {
    if (isOpeningRef.current) return;
    isOpeningRef.current = true;
    setIsOpening(true);
    setError(null);
    try {
      const { key } = await openFediverseConversation(account.uri);
      window.location.href = fediverseChatPath(key);
    } catch (cause) {
      console.error('Failed to open the Fediverse conversation:', cause);
      setError(fediverseErrorMessageOf(cause));
      isOpeningRef.current = false;
      setIsOpening(false);
    }
  };

  const candidates = result === null ? [] : recipientCandidates({ ...result, selfAccountId });

  return (
    <div class='space-y-3'>
      <h3 class='text-base font-bold text-charcoal dark:text-white'>新しい会話を始める</h3>
      {error !== null && <p role='alert' class='text-sm text-red-600 dark:text-red-400'>{error}</p>}
      <input
        type='text'
        value={input}
        aria-label='宛先'
        placeholder='ユーザー名、または user@host'
        maxLength={300}
        onInput={(event: Event) => {
          const value = (event.target as HTMLInputElement).value;
          setInput(value);
          search(value);
        }}
        class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset transition-all'
      />
      {isSearching && <p class={mutedClass}>Loading...</p>}
      {!isSearching && result !== null && candidates.length === 0 && (
        <p class={mutedClass}>{FEDIVERSE_ACTOR_NOT_FOUND_MESSAGE}</p>
      )}
      {candidates.map((account) => (
        <FediverseAccountRow key={account.id} account={account} onSelect={open} disabled={isOpening} />
      ))}
    </div>
  );
};
