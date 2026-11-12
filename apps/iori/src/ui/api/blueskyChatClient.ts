import type {
  IoriBlueskyChatConvoResponse,
  IoriBlueskyChatConvosResponse,
  IoriBlueskyChatMessagesResponse,
  IoriBlueskyChatOpenResponse,
  IoriBlueskyChatReadResponse,
  IoriBlueskyChatSendMessageResponse,
  IoriBlueskyChatUnreadCountResponse,
} from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { requestUrl } from './mastodonClient.ts';

const CHAT_PATH = '/api/iori/v1/bluesky/chat';

export type BlueskyChatApiError =
  & Error
  & Readonly<{ status: number; code: string | undefined; reason: string | undefined }>;

export const isBlueskyChatApiError = (error: unknown): error is BlueskyChatApiError =>
  error instanceof Error && typeof (error as { status?: unknown }).status === 'number';

export const toBlueskyChatApiError = async (res: Response): Promise<BlueskyChatApiError> => {
  const body: unknown = await res.json().catch(() => undefined);
  const record = typeof body === 'object' && body !== null ? body as Readonly<Record<string, unknown>> : {};
  const code = typeof record.error === 'string' ? record.error : undefined;
  const reason = typeof record.reason === 'string' ? record.reason : undefined;
  return Object.assign(new Error(code ?? `HTTP ${res.status}`), { status: res.status, code, reason });
};

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

const convoPath = (convoId: string): string => `${CHAT_PATH}/convos/${encodeURIComponent(convoId)}`;

export const unreadMessageCountUrl = (): string => `${CHAT_PATH}/unread_count`;

export const fetchBlueskyChatConvos = (cursor?: string): Promise<IoriBlueskyChatConvosResponse> =>
  get<IoriBlueskyChatConvosResponse>(requestUrl(`${CHAT_PATH}/convos`, { cursor }));

export const fetchBlueskyChatConvo = (convoId: string): Promise<IoriBlueskyChatConvoResponse> =>
  get<IoriBlueskyChatConvoResponse>(convoPath(convoId));

export const fetchBlueskyChatMessages = (
  convoId: string,
  cursor?: string,
): Promise<IoriBlueskyChatMessagesResponse> =>
  get<IoriBlueskyChatMessagesResponse>(requestUrl(`${convoPath(convoId)}/messages`, { cursor }));

export const fetchBlueskyChatUnreadCount = (): Promise<IoriBlueskyChatUnreadCountResponse> =>
  get<IoriBlueskyChatUnreadCountResponse>(unreadMessageCountUrl());

export const sendBlueskyChatMessage = async (
  convoId: string,
  text: string,
): Promise<IoriBlueskyChatSendMessageResponse> =>
  await (await post(`${convoPath(convoId)}/messages`, { text })).json() as IoriBlueskyChatSendMessageResponse;

export const markBlueskyChatRead = async (
  convoId: string,
  messageId?: string,
): Promise<IoriBlueskyChatReadResponse> =>
  await (await post(`${convoPath(convoId)}/read`, messageId === undefined ? {} : { messageId }))
    .json() as IoriBlueskyChatReadResponse;

export const acceptBlueskyChatConvo = async (convoId: string): Promise<void> => {
  await post(`${convoPath(convoId)}/accept`, {});
};

export const openBlueskyChatConvo = async (did: string): Promise<IoriBlueskyChatOpenResponse> =>
  await (await post(`${CHAT_PATH}/convos`, { did })).json() as IoriBlueskyChatOpenResponse;
