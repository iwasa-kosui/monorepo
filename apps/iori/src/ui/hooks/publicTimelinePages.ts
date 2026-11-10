import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { Page } from '../api/mastodonClient.ts';
import { appendUniqueById } from './appendUnique.ts';

export type PublicTimelineState = Readonly<{
  items: readonly Status[];
  nextMaxId: string | undefined;
}>;

export const emptyPublicTimeline: PublicTimelineState = { items: [], nextMaxId: undefined };

export const stateFromFirstPage = (page: Page<Status>): PublicTimelineState => ({
  items: page.items,
  nextMaxId: page.nextMaxId,
});

export const stateAfterLoadMore = (
  prev: PublicTimelineState,
  page: Page<Status>,
  maxId: string,
): PublicTimelineState => ({
  items: appendUniqueById(prev.items, page.items),
  nextMaxId: page.items.length === 0 || page.nextMaxId === maxId ? undefined : page.nextMaxId,
});
