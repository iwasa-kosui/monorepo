import type { BlueskyStatus } from '../api/mastodonClient.ts';

export const blueskyConnectionLabel = (
  input: Readonly<{ status: BlueskyStatus | undefined; loadFailed: boolean }>,
): string => {
  if (input.status === undefined) return input.loadFailed ? 'Bluesky の状態を読み込めませんでした' : '読み込み中...';
  return input.status.enabled ? 'Bluesky と連携しています' : 'Bluesky とは連携していません';
};
