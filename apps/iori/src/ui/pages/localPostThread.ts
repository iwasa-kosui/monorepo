import type { Status } from '../../adaptor/mastodon/entities.ts';
import { isNotFoundError, type StatusContext } from '../api/mastodonClient.ts';

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
      : { type: 'error', message: (status.reason as Error).message };
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
