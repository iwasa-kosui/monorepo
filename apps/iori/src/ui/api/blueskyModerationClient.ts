import type {
  IoriBlueskyBlockResponse,
  IoriBlueskyModerationStateResponse,
  IoriBlueskyMuteResponse,
  IoriBlueskyThreadMuteResponse,
} from '../../adaptor/routes/workerIoriBlueskyModerationRouter.ts';
import type { ReportCategory } from '../components/ReportModal.tsx';
import { BLUESKY_LOGIN_FAILED_ERROR, isMastodonApiError, requestUrl, toApiError } from './mastodonClient.ts';

const MODERATION_PATH = '/api/iori/v1/bluesky/moderation';
const MUTES_PATH = '/api/iori/v1/bluesky/mutes';
const THREAD_MUTES_PATH = '/api/iori/v1/bluesky/thread-mutes';
const BLOCKS_PATH = '/api/iori/v1/bluesky/blocks';
const REPORTS_PATH = '/api/iori/v1/bluesky/reports';

const send = async (method: 'POST' | 'DELETE', url: string, body?: unknown): Promise<Response> => {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw await toApiError(res);
  return res;
};

export const fetchBlueskyModeration = async (did: string): Promise<IoriBlueskyModerationStateResponse> => {
  const res = await fetch(`${MODERATION_PATH}/${encodeURIComponent(did)}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as IoriBlueskyModerationStateResponse;
};

export const muteBlueskyActor = async (did: string): Promise<IoriBlueskyMuteResponse> =>
  await (await send('POST', MUTES_PATH, { did })).json() as IoriBlueskyMuteResponse;

export const unmuteBlueskyActor = async (did: string): Promise<IoriBlueskyMuteResponse> =>
  await (await send('DELETE', requestUrl(MUTES_PATH, { did }))).json() as IoriBlueskyMuteResponse;

export const muteBlueskyThread = async (root: string): Promise<IoriBlueskyThreadMuteResponse> =>
  await (await send('POST', THREAD_MUTES_PATH, { root })).json() as IoriBlueskyThreadMuteResponse;

export const unmuteBlueskyThread = async (root: string): Promise<IoriBlueskyThreadMuteResponse> =>
  await (await send('DELETE', requestUrl(THREAD_MUTES_PATH, { root }))).json() as IoriBlueskyThreadMuteResponse;

export const blockBlueskyActor = async (did: string): Promise<IoriBlueskyBlockResponse> =>
  await (await send('POST', BLOCKS_PATH, { did })).json() as IoriBlueskyBlockResponse;

export const unblockBlueskyActor = async (did: string, blockUri?: string): Promise<IoriBlueskyBlockResponse> =>
  await (await send('DELETE', requestUrl(BLOCKS_PATH, { did, blockUri }))).json() as IoriBlueskyBlockResponse;

export const reportBlueskyActor = async (
  input: Readonly<{ did: string; category: ReportCategory; comment: string }>,
): Promise<void> => {
  await send('POST', REPORTS_PATH, input);
};

export type BlueskyModerationAction = 'mute' | 'muteThread' | 'block' | 'report';

const MODERATION_FAILURE_MESSAGES: Readonly<Record<BlueskyModerationAction, string>> = {
  mute: 'ミュートを変更できませんでした',
  muteThread: 'スレッドのミュートを変更できませんでした',
  block: 'ブロックを変更できませんでした',
  report: '通報できませんでした',
};

export const blueskyModerationFailureMessage = (action: BlueskyModerationAction, error: unknown): string =>
  isMastodonApiError(error) && error.message === BLUESKY_LOGIN_FAILED_ERROR
    ? 'Bluesky にログインできないため、操作できませんでした。'
    : MODERATION_FAILURE_MESSAGES[action];
