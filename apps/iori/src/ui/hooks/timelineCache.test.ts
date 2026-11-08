import { describe, expect, it } from 'vitest';

import type { CredentialAccount, Status } from '../../adaptor/mastodon/entities.ts';
import { emptyBlueskySource } from './homeFeed.ts';
import {
  type CachedTimeline,
  initialTimelineState,
  stateAfterFirstPage,
  stateAfterFirstPageFailure,
} from './timelineCache.ts';
import type { TimelineState } from './useTimeline.ts';

const me = { id: 'me', username: 'kosui' } as unknown as CredentialAccount;
const status = (id: string) => ({ id }) as unknown as Status;

const cached: CachedTimeline = {
  me,
  statuses: [status('1'), status('2')],
  nextMaxId: '2',
  bluesky: emptyBlueskySource,
};

describe('initialTimelineState', () => {
  it('starts as loading without a cache', () => {
    expect(initialTimelineState(undefined)).toEqual({ status: 'loading' });
  });

  it('starts as success with the cached statuses, cursor and account', () => {
    const state = initialTimelineState(cached);

    expect(state).toEqual({
      status: 'success',
      data: {
        me,
        statuses: cached.statuses,
        nextMaxId: '2',
        bluesky: emptyBlueskySource,
        followers: [],
        following: [],
      },
    });
  });

  it('starts with the cached Bluesky items and cursor', () => {
    const bluesky = { items: [], cursor: { before: 1000, beforeId: 'a' } };

    const state = initialTimelineState({ ...cached, bluesky });

    expect(state).toMatchObject({ status: 'success', data: { bluesky } });
  });
});

describe('stateAfterFirstPage', () => {
  it('replaces the cached statuses with the fetched ones and keeps loaded account lists', () => {
    const prev: TimelineState = {
      status: 'success',
      data: { ...(initialTimelineState(cached) as Extract<TimelineState, { status: 'success' }>).data, followers: [] },
    };

    const next = stateAfterFirstPage(prev, me, [status('3')], undefined, emptyBlueskySource);

    expect(next).toEqual({
      status: 'success',
      data: {
        me,
        statuses: [status('3')],
        nextMaxId: undefined,
        bluesky: emptyBlueskySource,
        followers: [],
        following: [],
      },
    });
  });

  it('builds the success state from loading', () => {
    expect(stateAfterFirstPage({ status: 'loading' }, me, [status('1')], '1', emptyBlueskySource).status).toBe(
      'success',
    );
  });
});

describe('stateAfterFirstPageFailure', () => {
  const shown = initialTimelineState(cached);

  it('keeps the cached view when the fetch fails while the cache is shown', () => {
    expect(stateAfterFirstPageFailure(shown, true, false, 'HTTP 500')).toBe(shown);
  });

  it('becomes error on 401 even when the cache is shown', () => {
    expect(stateAfterFirstPageFailure(shown, true, true, 'HTTP 401')).toEqual({ status: 'error', error: 'HTTP 401' });
  });

  it('keeps the existing error handling when no cache is shown', () => {
    expect(stateAfterFirstPageFailure({ status: 'loading' }, false, false, 'HTTP 500')).toEqual({
      status: 'error',
      error: 'HTTP 500',
    });
    expect(stateAfterFirstPageFailure(shown, false, false, 'HTTP 500')).toEqual({ status: 'error', error: 'HTTP 500' });
  });
});
