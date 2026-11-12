import type {
  IoriBlueskyChatConvoBody,
  IoriBlueskyChatMessageBody,
} from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { BLUESKY_CHAT_MAX_GRAPHEMES } from '../../domain/blueskyChat/blueskyChat.ts';
import { isBlueskyChatApiError } from '../api/blueskyChatClient.ts';
import { fediverseRouteOfPath } from './fediverseConversation.ts';

export const CHAT_NOT_PERMITTED_MESSAGE =
  'iori が使っている Bluesky のアプリパスワードに DM の許可がありません。bsky.app の設定で『ダイレクトメッセージへのアクセスを許可』を選んだアプリパスワードを作り、iori の設定を差し替えてください。';
export const CHAT_DISABLED_MESSAGE = 'Bluesky の連携が無効です';
export const CHAT_RECIPIENT_REJECTED_MESSAGE = 'この相手は、いまメッセージを受け付けていません。';
export const CHAT_RETRY_MESSAGE = 'メッセージの処理に失敗しました。しばらくしてからもう一度お試しください。';

export type ChatFailure = Readonly<
  { status: number | undefined; code: string | undefined; reason: string | undefined }
>;

export type ChatMessagesState = Readonly<{
  messages: readonly IoriBlueskyChatMessageBody[];
  addedCount: number;
}>;

export type ChatRoute =
  | Readonly<{ kind: 'list' }>
  | Readonly<{ kind: 'convo'; convoId: string }>
  | Readonly<{ kind: 'fediverseConvo'; key: string }>;

export type ChatKeyEvent = Readonly<{
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
}>;

const RECIPIENT_REJECTION_CODES: readonly string[] = [
  'MessagesDisabled',
  'NotFollowedBySender',
  'BlockedActor',
  'BlockedSubject',
  'RecipientNotFound',
  'AccountSuspended',
  'ConvoLocked',
];

const REASON_MESSAGES: Readonly<Record<string, string>> = {
  empty: 'メッセージを入力してください。',
  too_many_graphemes: `メッセージは ${BLUESKY_CHAT_MAX_GRAPHEMES} 文字までです。`,
  too_many_bytes: 'メッセージが長すぎます。短くしてください。',
};

export const chatErrorMessage = (failure: ChatFailure): string => {
  if (failure.status === 403 && failure.code === 'chat_not_permitted') return CHAT_NOT_PERMITTED_MESSAGE;
  if (failure.status === 409) return CHAT_DISABLED_MESSAGE;
  if (failure.status === 404 && failure.code === 'InvalidConvo') return 'この会話は見つかりません。';
  if (failure.status === 422) {
    if (failure.code !== undefined && RECIPIENT_REJECTION_CODES.includes(failure.code)) {
      return CHAT_RECIPIENT_REJECTED_MESSAGE;
    }
    if (failure.reason !== undefined && failure.reason in REASON_MESSAGES) return REASON_MESSAGES[failure.reason]!;
  }
  return CHAT_RETRY_MESSAGE;
};

export const chatErrorMessageOf = (error: unknown): string =>
  chatErrorMessage(
    isBlueskyChatApiError(error)
      ? { status: error.status, code: error.code, reason: error.reason }
      : { status: undefined, code: undefined, reason: undefined },
  );

export const chatRouteOfPath = (pathname: string): ChatRoute | undefined => {
  if (/^\/messages\/?$/.test(pathname)) return { kind: 'list' };
  if (/^\/messages\/fediverse(?:\/|$)/.test(pathname)) {
    const fediverse = fediverseRouteOfPath(pathname);
    return fediverse === undefined ? undefined : { kind: 'fediverseConvo', key: fediverse.key };
  }
  const encoded = /^\/messages\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (encoded === undefined) return undefined;
  try {
    return { kind: 'convo', convoId: decodeURIComponent(encoded) };
  } catch {
    return undefined;
  }
};

export const chatConvoPath = (convoId: string): string => `/messages/${encodeURIComponent(convoId)}`;

export const splitConvos = (
  convos: readonly IoriBlueskyChatConvoBody[],
): Readonly<{ requests: readonly IoriBlueskyChatConvoBody[]; accepted: readonly IoriBlueskyChatConvoBody[] }> => ({
  requests: convos.filter((convo) => convo.status === 'request'),
  accepted: convos.filter((convo) => convo.status !== 'request'),
});

export const graphemeCount = (text: string): number =>
  [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;

export const remainingGraphemes = (text: string, max = BLUESKY_CHAT_MAX_GRAPHEMES): number => max - graphemeCount(text);

export const isSendable = (text: string, isSending: boolean): boolean =>
  !isSending && text.trim() !== '' && remainingGraphemes(text.trim()) >= 0;

export const shouldSendOnKey = (event: ChatKeyEvent): boolean =>
  event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing;

export const mergeMessages = (
  existing: readonly IoriBlueskyChatMessageBody[],
  incoming: readonly IoriBlueskyChatMessageBody[],
): ChatMessagesState => {
  const incomingById = new Map<string, IoriBlueskyChatMessageBody>();
  for (const message of incoming) {
    if (message.id !== null) incomingById.set(message.id, message);
  }
  const knownIds = new Set<string>();
  const refreshed = existing.map((message) => {
    if (message.id === null) return message;
    knownIds.add(message.id);
    return incomingById.get(message.id) ?? message;
  });
  const added: IoriBlueskyChatMessageBody[] = [];
  for (const message of incoming) {
    if (message.id === null || knownIds.has(message.id)) continue;
    knownIds.add(message.id);
    added.push(message);
  }
  return { messages: [...refreshed, ...added], addedCount: added.length };
};

export const prependOlderMessages = (
  existing: readonly IoriBlueskyChatMessageBody[],
  older: readonly IoriBlueskyChatMessageBody[],
): readonly IoriBlueskyChatMessageBody[] => {
  const knownIds = new Set(existing.flatMap((message) => message.id === null ? [] : [message.id]));
  const seen = new Set<string>();
  const fresh = older.filter((message) => {
    if (message.id === null) return true;
    if (knownIds.has(message.id) || seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
  return [...fresh, ...existing];
};

export const latestMessageId = (messages: readonly IoriBlueskyChatMessageBody[]): string | undefined =>
  messages.findLast((message) => message.id !== null)?.id ?? undefined;

export const isOwnMessage = (
  message: IoriBlueskyChatMessageBody,
  peers: IoriBlueskyChatConvoBody['peers'],
): boolean => message.kind !== 'unsupported' && !peers.some((peer) => peer.did === message.senderDid);

export const groupReactions = (
  reactions: readonly Readonly<{ value: string; senderDid: string }>[],
): readonly Readonly<{ value: string; count: number }>[] => {
  const counts = new Map<string, number>();
  for (const reaction of reactions) counts.set(reaction.value, (counts.get(reaction.value) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count }));
};

export const convoTitle = (peers: IoriBlueskyChatConvoBody['peers']): string =>
  peers.length === 0 ? '会話' : peers.map((peer) => peer.displayName ?? peer.handle).join('、');

export const lastMessageSummary = (lastMessage: IoriBlueskyChatConvoBody['lastMessage']): string => {
  if (lastMessage === null) return 'まだメッセージはありません';
  if (lastMessage.kind === 'deleted') return '削除されたメッセージ';
  if (lastMessage.kind === 'unsupported') return '表示できないメッセージ';
  return lastMessage.text === null || lastMessage.text === '' ? '投稿を共有しました' : lastMessage.text;
};

export const formatChatTime = (at: number, now: number, timeZone?: string): string => {
  const date = new Date(at);
  const sameDay = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone });
  if (sameDay.format(date) === sameDay.format(new Date(now))) {
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone });
  }
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
};
