import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type {
  IoriBlueskyChatConvoBody,
  IoriBlueskyChatMessageBody,
} from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyProfilePathOf } from '../../helper/blueskyUrl.ts';
import {
  acceptBlueskyChatConvo,
  fetchBlueskyChatConvo,
  fetchBlueskyChatConvos,
  fetchBlueskyChatMessages,
  markBlueskyChatRead,
  sendBlueskyChatMessage,
} from '../api/blueskyChatClient.ts';
import { MESSAGES_READ_EVENT } from '../api/messageBadge.ts';
import { BlueskyChatComposer } from '../components/BlueskyChatComposer.tsx';
import { BlueskyChatConvoRow } from '../components/BlueskyChatConvoRow.tsx';
import { BlueskyChatMessageItem } from '../components/BlueskyChatMessageItem.tsx';
import { appendUniqueById } from '../hooks/appendUnique.ts';
import {
  chatErrorMessageOf,
  chatRouteOfPath,
  convoTitle,
  isOwnMessage,
  isSendable,
  latestMessageId,
  mergeMessages,
  prependOlderMessages,
  splitConvos,
} from '../hooks/blueskyChat.ts';
import { FediverseConversationPage, FediverseConversationSection } from './fediverseMessages.tsx';

const POLL_INTERVAL_MS = 10 * 1000;
const NEAR_BOTTOM_PX = 200;

const mutedClass = 'text-charcoal-light dark:text-gray-400';
const secondaryButtonClass =
  'px-4 py-2 rounded-xl text-sm text-charcoal dark:text-gray-200 bg-sand-light dark:bg-gray-700 hover:opacity-80 transition-opacity disabled:opacity-50';

const isNearBottom = (): boolean =>
  document.documentElement.scrollHeight - window.scrollY - window.innerHeight < NEAR_BOTTOM_PX;

const notifyRead = (): void => {
  window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
};

const ConvoSection = (
  { title, convos, now }: Readonly<{ title: string; convos: readonly IoriBlueskyChatConvoBody[]; now: number }>,
) => (
  <div class='space-y-3'>
    <h3 class='text-base font-bold text-charcoal dark:text-white'>{title}</h3>
    {convos.map((convo) => <BlueskyChatConvoRow key={convo.id} convo={convo} now={now} />)}
  </div>
);

const BlueskyConvoSection = () => {
  const [convos, setConvos] = useState<readonly IoriBlueskyChatConvoBody[] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        const page = await fetchBlueskyChatConvos();
        setConvos(page.convos);
        setCursor(page.cursor ?? undefined);
      } catch (cause) {
        console.error('Failed to load Bluesky conversations:', cause);
        setError(chatErrorMessageOf(cause));
      }
    };
    void load();
  }, []);

  const loadMore = async () => {
    if (cursor === undefined || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const page = await fetchBlueskyChatConvos(cursor);
      setConvos((prev) => appendUniqueById(prev ?? [], page.convos));
      setCursor(page.cursor === null || page.cursor === cursor ? undefined : page.cursor);
    } catch (cause) {
      console.error('Failed to load more Bluesky conversations:', cause);
      setError(chatErrorMessageOf(cause));
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  };

  const now = Date.now();
  const { requests, accepted } = splitConvos(convos ?? []);

  return (
    <section class='space-y-3' data-testid='bluesky-section'>
      <h2 class='text-lg font-bold text-charcoal dark:text-white'>Bluesky</h2>
      {error !== null && <p role='alert' class='text-sm text-red-600 dark:text-red-400'>{error}</p>}
      {convos === null
        ? error === null && <p class={mutedClass}>Loading...</p>
        : (
          <div class='space-y-6'>
            {requests.length > 0 && <ConvoSection title='リクエスト' convos={requests} now={now} />}
            {accepted.length > 0 && <ConvoSection title='会話' convos={accepted} now={now} />}
            {requests.length === 0 && accepted.length === 0 && <p class={mutedClass}>まだ会話がありません。</p>}
            {cursor !== undefined && (
              <button type='button' onClick={loadMore} disabled={isLoadingMore} class={secondaryButtonClass}>
                {isLoadingMore ? '読み込み中' : 'さらに読み込む'}
              </button>
            )}
          </div>
        )}
    </section>
  );
};

const ConvoListPage = () => (
  <>
    <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>メッセージ</h1>
    <div class='space-y-10'>
      <FediverseConversationSection />
      <BlueskyConvoSection />
    </div>
  </>
);

const ConvoPage = ({ convoId }: Readonly<{ convoId: string }>) => {
  const [convo, setConvo] = useState<IoriBlueskyChatConvoBody | null>(null);
  const [messages, setMessages] = useState<readonly IoriBlueskyChatMessageBody[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | undefined>(undefined);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const messagesRef = useRef<readonly IoriBlueskyChatMessageBody[]>([]);
  const isSendingRef = useRef(false);
  const isAcceptingRef = useRef(false);
  const isLoadingOlderRef = useRef(false);
  const scrollToBottomRef = useRef(false);

  const replaceMessages = (next: readonly IoriBlueskyChatMessageBody[]) => {
    messagesRef.current = next;
    setMessages(next);
  };

  const markRead = useCallback(async (list: readonly IoriBlueskyChatMessageBody[]) => {
    try {
      await markBlueskyChatRead(convoId, latestMessageId(list));
      notifyRead();
    } catch (cause) {
      console.error('Failed to mark the Bluesky conversation as read:', cause);
    }
  }, [convoId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedConvo, page] = await Promise.all([
          fetchBlueskyChatConvo(convoId),
          fetchBlueskyChatMessages(convoId),
        ]);
        setConvo(loadedConvo.convo);
        replaceMessages(page.messages);
        setOlderCursor(page.cursor ?? undefined);
        scrollToBottomRef.current = true;
        setIsLoaded(true);
        if (loadedConvo.convo.unreadCount > 0) void markRead(page.messages);
      } catch (cause) {
        console.error('Failed to load the Bluesky conversation:', cause);
        setLoadError(chatErrorMessageOf(cause));
      }
    };
    void load();
  }, [convoId, markRead]);

  useEffect(() => {
    if (!isLoaded) return;
    const poll = async () => {
      if (document.hidden || isSendingRef.current) return;
      try {
        const page = await fetchBlueskyChatMessages(convoId);
        const merged = mergeMessages(messagesRef.current ?? [], page.messages);
        scrollToBottomRef.current = merged.addedCount > 0 && isNearBottom();
        replaceMessages(merged.messages);
        if (merged.addedCount > 0) void markRead(merged.messages);
      } catch (cause) {
        console.error('Failed to refresh the Bluesky conversation:', cause);
      }
    };
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => void poll();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [convoId, isLoaded, markRead]);

  useEffect(() => {
    if (!scrollToBottomRef.current) return;
    scrollToBottomRef.current = false;
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [messages]);

  const loadOlder = async () => {
    if (olderCursor === undefined || isLoadingOlderRef.current) return;
    isLoadingOlderRef.current = true;
    setIsLoadingOlder(true);
    setActionError(null);
    try {
      const page = await fetchBlueskyChatMessages(convoId, olderCursor);
      replaceMessages(prependOlderMessages(messagesRef.current ?? [], page.messages));
      setOlderCursor(page.cursor === null || page.cursor === olderCursor ? undefined : page.cursor);
    } catch (cause) {
      console.error('Failed to load older Bluesky messages:', cause);
      setActionError(chatErrorMessageOf(cause));
    } finally {
      isLoadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  };

  const send = async () => {
    if (isSendingRef.current || !isSendable(text, false)) return;
    isSendingRef.current = true;
    setIsSending(true);
    setActionError(null);
    try {
      const sent = await sendBlueskyChatMessage(convoId, text.trim());
      scrollToBottomRef.current = true;
      replaceMessages(mergeMessages(messagesRef.current ?? [], [sent.message]).messages);
      setText('');
      setConvo((prev) => prev === null ? prev : { ...prev, status: 'accepted' });
    } catch (cause) {
      console.error('Failed to send the Bluesky message:', cause);
      setActionError(chatErrorMessageOf(cause));
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  const accept = async () => {
    if (isAcceptingRef.current) return;
    isAcceptingRef.current = true;
    setIsAccepting(true);
    setActionError(null);
    try {
      await acceptBlueskyChatConvo(convoId);
      setConvo((prev) => prev === null ? prev : { ...prev, status: 'accepted' });
      notifyRead();
    } catch (cause) {
      console.error('Failed to accept the Bluesky conversation:', cause);
      setActionError(chatErrorMessageOf(cause));
    } finally {
      isAcceptingRef.current = false;
      setIsAccepting(false);
    }
  };

  const backLink = (
    <a href='/messages' class='text-sm text-terracotta hover:underline dark:text-terracotta-light'>← メッセージ</a>
  );

  if (loadError !== null) {
    return (
      <>
        <div class='mb-4'>{backLink}</div>
        <p role='alert' class='text-red-600 dark:text-red-400'>{loadError}</p>
      </>
    );
  }
  if (convo === null || !isLoaded) return <p class={mutedClass}>Loading...</p>;

  const peer = convo.peers[0];
  const now = Date.now();

  return (
    <>
      <header class='mb-4 space-y-2'>
        {backLink}
        <h1 class='truncate text-xl font-bold text-charcoal dark:text-white'>
          {peer === undefined
            ? convoTitle(convo.peers)
            : (
              <a href={blueskyProfilePathOf(peer.did)} class='hover:underline'>
                {convoTitle(convo.peers)}
                <span class={`ml-2 text-sm font-normal ${mutedClass}`}>@{peer.handle}</span>
              </a>
            )}
        </h1>
      </header>
      {convo.status === 'request' && (
        <div class='mb-4 flex items-center justify-between gap-3 rounded-clay bg-sand-light dark:bg-gray-800 p-4'>
          <p class='text-sm text-charcoal dark:text-gray-100'>メッセージのリクエストです</p>
          <button
            type='button'
            onClick={accept}
            disabled={isAccepting}
            class='px-4 py-2 rounded-xl bg-terracotta text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50'
          >
            承諾する
          </button>
        </div>
      )}
      {olderCursor !== undefined && (
        <div class='mb-4 text-center'>
          <button type='button' onClick={loadOlder} disabled={isLoadingOlder} class={secondaryButtonClass}>
            {isLoadingOlder ? '読み込み中' : '以前のメッセージを読み込む'}
          </button>
        </div>
      )}
      {messages.length === 0
        ? <p class={mutedClass}>まだメッセージはありません。</p>
        : (
          <ul class='space-y-3'>
            {messages.map((message, index) => (
              <BlueskyChatMessageItem
                key={message.id ?? `unsupported-${index}`}
                message={message}
                own={isOwnMessage(message, convo.peers)}
                now={now}
              />
            ))}
          </ul>
        )}
      <BlueskyChatComposer
        text={text}
        isSending={isSending}
        canSend={isSendable(text, isSending)}
        error={actionError}
        onChange={setText}
        onSend={() => void send()}
      />
    </>
  );
};

const App = () => {
  const route = chatRouteOfPath(window.location.pathname);
  if (route === undefined) return <p class={mutedClass}>この会話は見つかりません。</p>;
  if (route.kind === 'list') return <ConvoListPage />;
  return route.kind === 'fediverseConvo'
    ? <FediverseConversationPage conversationKey={route.key} />
    : <ConvoPage convoId={route.convoId} />;
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
