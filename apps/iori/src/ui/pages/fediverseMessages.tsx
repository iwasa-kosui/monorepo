import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type {
  IoriFediverseConversationBody,
  IoriFediverseConversationPeerBody,
} from '../../adaptor/routes/workerIoriFediverseConversationsRouter.ts';
import { safeUrl } from '../../helper/safeUrl.ts';
import {
  fetchFediverseConversation,
  fetchFediverseConversations,
  fetchFediverseMessages,
  markFediverseConversationRead,
  sendFediverseMessage,
} from '../api/fediverseConversationClient.ts';
import { MESSAGES_READ_EVENT } from '../api/messageBadge.ts';
import { BlueskyChatComposer } from '../components/BlueskyChatComposer.tsx';
import { FediverseChatConvoRow } from '../components/FediverseChatConvoRow.tsx';
import { FediverseChatMessageItem } from '../components/FediverseChatMessageItem.tsx';
import {
  FEDIVERSE_ENCRYPTION_NOTICE,
  fediverseConversationTitle,
  fediverseErrorMessageOf,
  fediverseRemainingCharacters,
  hasIncomingFediverseMessage,
  isFediverseSendable,
  isOwnFediverseMessage,
  mergeFediverseConversations,
  mergeFediverseMessages,
  prependOlderFediverseMessages,
} from '../hooks/fediverseConversation.ts';

const POLL_INTERVAL_MS = 15 * 1000;
const NEAR_BOTTOM_PX = 200;

const mutedClass = 'text-charcoal-light dark:text-gray-400';
const secondaryButtonClass =
  'px-4 py-2 rounded-xl text-sm text-charcoal dark:text-gray-200 bg-sand-light dark:bg-gray-700 hover:opacity-80 transition-opacity disabled:opacity-50';

const isNearBottom = (): boolean =>
  document.documentElement.scrollHeight - window.scrollY - window.innerHeight < NEAR_BOTTOM_PX;

const notifyRead = (): void => {
  window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
};

export const FediverseConversationSection = () => {
  const [conversations, setConversations] = useState<readonly IoriFediverseConversationBody[] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        const page = await fetchFediverseConversations();
        setConversations(mergeFediverseConversations([], page.conversations));
        setCursor(page.cursor ?? undefined);
      } catch (cause) {
        console.error('Failed to load Fediverse conversations:', cause);
        setError(fediverseErrorMessageOf(cause));
      }
    };
    void load();
  }, []);

  const loadMore = async () => {
    if (cursor === undefined || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const page = await fetchFediverseConversations(cursor);
      setConversations((prev) => mergeFediverseConversations(prev ?? [], page.conversations));
      setCursor(page.cursor === null || page.cursor === cursor ? undefined : page.cursor);
    } catch (cause) {
      console.error('Failed to load more Fediverse conversations:', cause);
      setError(fediverseErrorMessageOf(cause));
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  };

  const now = Date.now();

  return (
    <section class='space-y-3' data-testid='fediverse-section'>
      <h2 class='text-lg font-bold text-charcoal dark:text-white'>Fediverse</h2>
      {error !== null && <p role='alert' class='text-sm text-red-600 dark:text-red-400'>{error}</p>}
      {conversations === null
        ? error === null && <p class={mutedClass}>Loading...</p>
        : (
          <>
            {conversations.map((conversation) => (
              <FediverseChatConvoRow key={conversation.key} conversation={conversation} now={now} />
            ))}
            {conversations.length === 0 && <p class={mutedClass}>まだ会話がありません。</p>}
            {cursor !== undefined && (
              <button type='button' onClick={loadMore} disabled={isLoadingMore} class={secondaryButtonClass}>
                {isLoadingMore ? '読み込み中' : 'さらに読み込む'}
              </button>
            )}
          </>
        )}
    </section>
  );
};

const PeerLink = ({ peer }: Readonly<{ peer: IoriFediverseConversationPeerBody }>) => {
  const label = peer.displayName.trim() === '' ? peer.acct : peer.displayName;
  const path = safeUrl(peer.path);
  const content = (
    <>
      {label}
      <span class={`ml-2 text-sm font-normal ${mutedClass}`}>@{peer.acct}</span>
    </>
  );
  return path === undefined ? <span>{content}</span> : <a href={path} class='hover:underline'>{content}</a>;
};

export const FediverseConversationPage = ({ conversationKey }: Readonly<{ conversationKey: string }>) => {
  const [conversation, setConversation] = useState<IoriFediverseConversationBody | null>(null);
  const [messages, setMessages] = useState<readonly Status[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | undefined>(undefined);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const messagesRef = useRef<readonly Status[]>([]);
  const [viewerAccountId, setViewerAccountId] = useState<string | null>(null);
  const viewerAccountIdRef = useRef<string | null>(null);
  const isSendingRef = useRef(false);
  const isLoadingOlderRef = useRef(false);
  const scrollToBottomRef = useRef(false);

  const replaceMessages = (next: readonly Status[]) => {
    messagesRef.current = next;
    setMessages(next);
  };

  const markRead = useCallback(async () => {
    try {
      await markFediverseConversationRead(conversationKey);
      setConversation((prev) => prev === null ? prev : { ...prev, unreadCount: 0 });
      notifyRead();
    } catch (cause) {
      console.error('Failed to mark the Fediverse conversation as read:', cause);
    }
  }, [conversationKey]);

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedConversation, page] = await Promise.all([
          fetchFediverseConversation(conversationKey),
          fetchFediverseMessages(conversationKey),
        ]);
        viewerAccountIdRef.current = loadedConversation.viewerAccountId;
        setViewerAccountId(loadedConversation.viewerAccountId);
        setConversation(loadedConversation.conversation);
        replaceMessages(page.messages);
        setOlderCursor(page.cursor ?? undefined);
        scrollToBottomRef.current = true;
        setIsLoaded(true);
        if (loadedConversation.conversation.unreadCount > 0) void markRead();
      } catch (cause) {
        console.error('Failed to load the Fediverse conversation:', cause);
        setLoadError(fediverseErrorMessageOf(cause));
      }
    };
    void load();
  }, [conversationKey, markRead]);

  useEffect(() => {
    if (!isLoaded) return;
    const poll = async () => {
      if (document.hidden || isSendingRef.current) return;
      try {
        const page = await fetchFediverseMessages(conversationKey);
        const merged = mergeFediverseMessages(messagesRef.current ?? [], page.messages);
        scrollToBottomRef.current = merged.added.length > 0 && isNearBottom();
        replaceMessages(merged.messages);
        const viewer = viewerAccountIdRef.current;
        if (viewer !== null && hasIncomingFediverseMessage(merged.added, viewer)) void markRead();
      } catch (cause) {
        console.error('Failed to refresh the Fediverse conversation:', cause);
      }
    };
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => void poll();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [conversationKey, isLoaded, markRead]);

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
      const page = await fetchFediverseMessages(conversationKey, olderCursor);
      replaceMessages(prependOlderFediverseMessages(messagesRef.current ?? [], page.messages));
      setOlderCursor(page.cursor === null || page.cursor === olderCursor ? undefined : page.cursor);
    } catch (cause) {
      console.error('Failed to load older Fediverse messages:', cause);
      setActionError(fediverseErrorMessageOf(cause));
    } finally {
      isLoadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  };

  const send = async () => {
    if (isSendingRef.current || !isFediverseSendable(text, false)) return;
    isSendingRef.current = true;
    setIsSending(true);
    setActionError(null);
    try {
      const sent = await sendFediverseMessage(conversationKey, text.trim());
      scrollToBottomRef.current = true;
      replaceMessages(mergeFediverseMessages(messagesRef.current ?? [], [sent.message]).messages);
      setText('');
    } catch (cause) {
      console.error('Failed to send the Fediverse message:', cause);
      setActionError(fediverseErrorMessageOf(cause));
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
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
  if (conversation === null || viewerAccountId === null || !isLoaded) return <p class={mutedClass}>Loading...</p>;

  const now = Date.now();

  return (
    <>
      <header class='mb-4 space-y-2'>
        {backLink}
        <h1 class='text-xl font-bold text-charcoal dark:text-white truncate'>
          {conversation.peers.length === 0
            ? fediverseConversationTitle(conversation.peers)
            : conversation.peers.map((peer) => (
              <span key={peer.actorUri} class='block truncate'>
                <PeerLink peer={peer} />
              </span>
            ))}
        </h1>
      </header>
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
            {messages.map((message) => (
              <FediverseChatMessageItem
                key={message.id}
                message={message}
                own={isOwnFediverseMessage(message, viewerAccountId)}
                now={now}
              />
            ))}
          </ul>
        )}
      <BlueskyChatComposer
        text={text}
        isSending={isSending}
        canSend={isFediverseSendable(text, isSending)}
        error={actionError}
        remaining={fediverseRemainingCharacters(text)}
        notice={FEDIVERSE_ENCRYPTION_NOTICE}
        testId='fediverse-chat-remaining'
        onChange={setText}
        onSend={() => void send()}
      />
    </>
  );
};
