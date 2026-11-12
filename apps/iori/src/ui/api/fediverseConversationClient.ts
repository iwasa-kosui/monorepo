import type {
  IoriFediverseConversationMessagesResponse,
  IoriFediverseConversationOpenResponse,
  IoriFediverseConversationResponse,
  IoriFediverseConversationSendMessageResponse,
  IoriFediverseConversationsResponse,
} from '../../adaptor/routes/workerIoriFediverseConversationsRouter.ts';
import { toBlueskyChatApiError } from './blueskyChatClient.ts';
import { requestUrl } from './mastodonClient.ts';

const CONVERSATIONS_PATH = '/api/iori/v1/fediverse/conversations';

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(path, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  if (!res.ok) throw await toBlueskyChatApiError(res);
  return await res.json() as T;
};

const post = async (path: string, body: unknown): Promise<Response> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toBlueskyChatApiError(res);
  return res;
};

const conversationPath = (key: string): string => `${CONVERSATIONS_PATH}/${encodeURIComponent(key)}`;

export const unreadFediverseMessageCountUrl = (): string => `${CONVERSATIONS_PATH}/unread_count`;

export const fetchFediverseConversations = (cursor?: string): Promise<IoriFediverseConversationsResponse> =>
  get<IoriFediverseConversationsResponse>(requestUrl(CONVERSATIONS_PATH, { cursor }));

export const fetchFediverseConversation = (key: string): Promise<IoriFediverseConversationResponse> =>
  get<IoriFediverseConversationResponse>(conversationPath(key));

export const fetchFediverseMessages = (
  key: string,
  cursor?: string,
): Promise<IoriFediverseConversationMessagesResponse> =>
  get<IoriFediverseConversationMessagesResponse>(requestUrl(`${conversationPath(key)}/messages`, { cursor }));

export const sendFediverseMessage = async (
  key: string,
  text: string,
): Promise<IoriFediverseConversationSendMessageResponse> =>
  await (await post(`${conversationPath(key)}/messages`, { text }))
    .json() as IoriFediverseConversationSendMessageResponse;

export const markFediverseConversationRead = async (key: string): Promise<void> => {
  await post(`${conversationPath(key)}/read`, {});
};

export const openFediverseConversation = async (actorUri: string): Promise<IoriFediverseConversationOpenResponse> =>
  await (await post(CONVERSATIONS_PATH, { actorUri })).json() as IoriFediverseConversationOpenResponse;
