import type { Status } from '../../adaptor/mastodon/entities.ts';
import { isNotFoundError, type StatusContext } from '../api/mastodonClient.ts';
import { displayStatus, isLocalAccount, updateStatusesByPostId } from '../api/status.ts';

export type LocalPostThread =
  | Readonly<{ type: 'notFound' }>
  | Readonly<{ type: 'error'; message: string }>
  | Readonly<{
    type: 'loaded';
    currentPost: Status;
    ancestors: readonly Status[];
    descendants: readonly Status[];
    contextFailed: boolean;
  }>;

export const resolveLocalPostThread = (
  status: PromiseSettledResult<Status>,
  context: PromiseSettledResult<StatusContext>,
): LocalPostThread => {
  if (status.status === 'rejected') {
    return isNotFoundError(status.reason)
      ? { type: 'notFound' }
      : { type: 'error', message: status.reason instanceof Error ? status.reason.message : String(status.reason) };
  }
  if (context.status === 'rejected') {
    return { type: 'loaded', currentPost: status.value, ancestors: [], descendants: [], contextFailed: true };
  }
  return {
    type: 'loaded',
    currentPost: status.value,
    ancestors: context.value.ancestors,
    descendants: context.value.descendants,
    contextFailed: false,
  };
};

export const shouldReloadContext = (remote: Readonly<{ fetched: number }>): boolean => remote.fetched > 0;

export const applyContext = <T extends Readonly<{ ancestors: readonly Status[]; descendants: readonly Status[] }>>(
  thread: T | null,
  context: StatusContext,
): T | null => thread === null ? null : { ...thread, ancestors: context.ancestors, descendants: context.descendants };

export const showsRemoteContextLoading = (isLoadingRemoteContext: boolean, currentPost: Status | null): boolean =>
  isLoadingRemoteContext && currentPost !== null && !isLocalAccount(displayStatus(currentPost).account);

export const updateThreadStatuses = <
  T extends Readonly<{ ancestors: readonly Status[]; currentPost: Status | null; descendants: readonly Status[] }>,
>(
  thread: T | null,
  postId: string,
  updater: (status: Status) => Status,
): T | null =>
  thread === null ? null : {
    ...thread,
    ancestors: updateStatusesByPostId(thread.ancestors, postId, updater),
    currentPost: thread.currentPost !== null && displayStatus(thread.currentPost).id === postId
      ? updater(thread.currentPost)
      : thread.currentPost,
    descendants: updateStatusesByPostId(thread.descendants, postId, updater),
  };
