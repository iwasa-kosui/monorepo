import type { Status } from '../../adaptor/mastodon/entities.ts';
import { MAX_STATUS_CHARACTERS } from '../../adaptor/mastodon/instance.ts';
import type {
  IoriFediverseConversationBody,
  IoriFediverseConversationPeerBody,
} from '../../adaptor/routes/workerIoriFediverseConversationsRouter.ts';
import { isBlueskyChatApiError } from '../api/blueskyChatClient.ts';

export const FEDIVERSE_NOT_PERMITTED_MESSAGE = 'Fediverse のメッセージを使えるのは、このサーバーの所有者だけです。';
export const FEDIVERSE_NOT_FOUND_MESSAGE = 'この会話は見つかりません。';
export const FEDIVERSE_ACTOR_NOT_FOUND_MESSAGE = 'この相手のアカウントが見つかりません。';
export const FEDIVERSE_PEER_REJECTED_MESSAGE = 'この相手には、iori からメッセージを送れません。';
export const FEDIVERSE_DELIVERY_FAILED_MESSAGE = '送れませんでした。時間をおいてもう一度試してください。';
export const FEDIVERSE_RETRY_MESSAGE = 'メッセージの処理に失敗しました。しばらくしてからもう一度お試しください。';
export const FEDIVERSE_ENCRYPTION_NOTICE =
  'このメッセージは相手のサーバーにも保存されます。サーバーの管理者が読める場合があります。';

export type FediverseFailure = Readonly<
  { status: number | undefined; code: string | undefined; reason: string | undefined }
>;

export type FediverseMessagesState = Readonly<{
  messages: readonly Status[];
  added: readonly Status[];
}>;

export const fediverseChatPath = (key: string): string => `/messages/fediverse/${encodeURIComponent(key)}`;

export const fediverseRouteOfPath = (pathname: string): Readonly<{ key: string }> | undefined => {
  const encoded = /^\/messages\/fediverse\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (encoded === undefined) return undefined;
  try {
    return { key: decodeURIComponent(encoded) };
  } catch {
    return undefined;
  }
};

export const fediverseErrorMessage = (failure: FediverseFailure): string => {
  if (failure.status === 403) return FEDIVERSE_NOT_PERMITTED_MESSAGE;
  if (failure.status === 400) return FEDIVERSE_NOT_FOUND_MESSAGE;
  if (failure.status === 404) return FEDIVERSE_ACTOR_NOT_FOUND_MESSAGE;
  if (failure.status === 422) {
    if (failure.code === 'Validation failed: peers') return FEDIVERSE_PEER_REJECTED_MESSAGE;
    if (failure.reason === 'empty') return 'メッセージを入力してください。';
    if (failure.reason === 'too_long') return `メッセージは ${MAX_STATUS_CHARACTERS} 文字までです。`;
  }
  if (failure.status === 502) return FEDIVERSE_DELIVERY_FAILED_MESSAGE;
  return FEDIVERSE_RETRY_MESSAGE;
};

export const fediverseErrorMessageOf = (error: unknown): string =>
  fediverseErrorMessage(
    isBlueskyChatApiError(error)
      ? { status: error.status, code: error.code, reason: error.reason }
      : { status: undefined, code: undefined, reason: undefined },
  );

export const fediverseCharacterCount = (text: string): number => [...text].length;

export const fediverseRemainingCharacters = (text: string): number =>
  MAX_STATUS_CHARACTERS - fediverseCharacterCount(text);

export const isFediverseSendable = (text: string, isSending: boolean): boolean =>
  !isSending && text.trim() !== '' && fediverseRemainingCharacters(text.trim()) >= 0;

export const sortFediverseConversations = (
  conversations: readonly IoriFediverseConversationBody[],
): readonly IoriFediverseConversationBody[] =>
  [...conversations].sort((a, b) => (b.lastMessage?.sentAt ?? 0) - (a.lastMessage?.sentAt ?? 0));

export const mergeFediverseConversations = (
  existing: readonly IoriFediverseConversationBody[],
  incoming: readonly IoriFediverseConversationBody[],
): readonly IoriFediverseConversationBody[] => {
  const known = new Set(existing.map((conversation) => conversation.key));
  const fresh = incoming.filter((conversation) => {
    if (known.has(conversation.key)) return false;
    known.add(conversation.key);
    return true;
  });
  return sortFediverseConversations([...existing, ...fresh]);
};

const byCreatedAt = (a: Status, b: Status): number => Date.parse(a.created_at) - Date.parse(b.created_at);

export const mergeFediverseMessages = (
  existing: readonly Status[],
  incoming: readonly Status[],
): FediverseMessagesState => {
  const incomingById = new Map(incoming.map((status) => [status.id, status]));
  const knownIds = new Set(existing.map((status) => status.id));
  const refreshed = existing.map((status) => incomingById.get(status.id) ?? status);
  const added = incoming.filter((status) => {
    if (knownIds.has(status.id)) return false;
    knownIds.add(status.id);
    return true;
  });
  return { messages: [...refreshed, ...added].sort(byCreatedAt), added };
};

export const prependOlderFediverseMessages = (
  existing: readonly Status[],
  older: readonly Status[],
): readonly Status[] => mergeFediverseMessages(existing, older).messages;

export const isOwnFediverseMessage = (status: Status, viewerAccountId: string): boolean =>
  status.account.id === viewerAccountId;

export const hasIncomingFediverseMessage = (added: readonly Status[], viewerAccountId: string): boolean =>
  added.some((status) => !isOwnFediverseMessage(status, viewerAccountId));

export const fediverseConversationTitle = (peers: readonly IoriFediverseConversationPeerBody[]): string =>
  peers.length === 0
    ? '会話'
    : peers.map((peer) => peer.displayName.trim() === '' ? peer.acct : peer.displayName).join('、');

export const fediverseLastMessageSummary = (lastMessage: IoriFediverseConversationBody['lastMessage']): string => {
  if (lastMessage === null) return 'まだメッセージはありません';
  return lastMessage.text === '' ? '添付ファイルを送りました' : lastMessage.text;
};

export type FediverseMessageDisclosure = Readonly<{ spoiler: string | null; concealsMedia: boolean }>;

export const fediverseMessageDisclosure = (status: Status): FediverseMessageDisclosure => ({
  spoiler: status.spoiler_text === '' ? null : status.spoiler_text,
  concealsMedia: status.sensitive && status.media_attachments.length > 0,
});
