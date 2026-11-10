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

describe('stateFromFirstPage', () => {
  it('keeps the items and the next cursor of the first page', () => {
    const state = stateFromFirstPage(page(['a', 'b'], 'b'));

    expect(ids(state.items)).toEqual(['a', 'b']);
    expect(state.nextMaxId).toBe('b');
  });

  it('has no next cursor when the first page has no Link next', () => {
    expect(stateFromFirstPage(page(['a'], undefined)).nextMaxId).toBeUndefined();
  });
});

describe('stateAfterLoadMore', () => {
  const first = stateFromFirstPage(page(['a', 'b'], 'b'));

  it('appends the new items and moves the cursor to the next one', () => {
    const state = stateAfterLoadMore(first, page(['c', 'd'], 'd'), 'b');

    expect(ids(state.items)).toEqual(['a', 'b', 'c', 'd']);
    expect(state.nextMaxId).toBe('d');
  });

  it('drops items that are already shown', () => {
    const state = stateAfterLoadMore(first, page(['b', 'c'], 'c'), 'b');

    expect(ids(state.items)).toEqual(['a', 'b', 'c']);
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

  it('stops loading when the last page has no Link next', () => {
    const state = stateAfterLoadMore(first, page(['c'], undefined), 'b');

    expect(state.nextMaxId).toBeUndefined();
  });
});
