import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { Page } from '../api/mastodonClient.ts';
import { stateAfterLoadMore, stateFromFirstPage } from './publicTimelinePages.ts';

const status = (id: string) => ({ id }) as Status;

const page = (ids: readonly string[], nextMaxId: string | undefined): Page<Status> => ({
  items: ids.map(status),
  nextMaxId,
  prevMinId: undefined,
});

const ids = (items: readonly Status[]) => items.map((s) => s.id);

describe('stateAfterLoadMore', () => {
  const first = stateFromFirstPage(page(['a', 'b'], 'b'));

  it('appends the new items and moves the cursor to the next one', () => {
    const state = stateAfterLoadMore(first, page(['c', 'd'], 'd'), 'b');

    expect(ids(state.items)).toEqual(['a', 'b', 'c', 'd']);
    expect(state.nextMaxId).toBe('d');
  });

  it('stops loading when the page is empty', () => {
    const state = stateAfterLoadMore(first, page([], 'x'), 'b');

    expect(ids(state.items)).toEqual(['a', 'b']);
    expect(state.nextMaxId).toBeUndefined();
  });

  it('stops loading when the next cursor is the same as the requested one', () => {
    const state = stateAfterLoadMore(first, page(['c'], 'b'), 'b');

    expect(ids(state.items)).toEqual(['a', 'b', 'c']);
    expect(state.nextMaxId).toBeUndefined();
  });
});
