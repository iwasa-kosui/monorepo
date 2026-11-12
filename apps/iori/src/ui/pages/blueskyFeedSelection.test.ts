import { describe, expect, it } from 'vitest';

import type { BlueskySavedFeedView } from '../api/blueskyFeedClient.ts';
import {
  fallbackFeedUriOf,
  feedUriOfSearch,
  feedViewOfSearch,
  selectedFeedOf,
  shownFeedsOf,
  unsavedFeedUriOf,
  withFeedUri,
  withFeedView,
} from './blueskyFeedSelection.ts';

const FEED = 'at://did:plc:gen/app.bsky.feed.generator/a';
const LIST = 'at://did:plc:own/app.bsky.graph.list/b';
const feeds: readonly BlueskySavedFeedView[] = [
  { uri: FEED, kind: 'feed', pinned: true },
  { uri: LIST, kind: 'list', pinned: false },
];

describe('feedUriOfSearch', () => {
  it('uri のクエリを返す', () => {
    expect(feedUriOfSearch(`?uri=${encodeURIComponent(LIST)}`)).toBe(LIST);
  });

  it('uri が無い、または空のときは undefined にする', () => {
    expect(feedUriOfSearch('')).toBeUndefined();
    expect(feedUriOfSearch('?uri=')).toBeUndefined();
    expect(feedUriOfSearch('?other=1')).toBeUndefined();
  });
});

describe('withFeedUri', () => {
  it('uri をエンコードして付け、ほかのクエリは残す', () => {
    expect(withFeedUri('', FEED)).toBe(`?uri=${encodeURIComponent(FEED)}`);
    expect(withFeedUri('?a=1&uri=old', LIST)).toBe(`?a=1&uri=${encodeURIComponent(LIST)}`);
  });

  it('付けた結果を feedUriOfSearch で読み戻せる', () => {
    expect(feedUriOfSearch(withFeedUri('', LIST))).toBe(LIST);
  });
});

describe('selectedFeedOf', () => {
  it('uri に一致する項目を返す', () => {
    expect(selectedFeedOf(feeds, LIST)).toBe(feeds[1]);
  });

  it('uri が無い、または一覧に無いときは先頭の項目を返す', () => {
    expect(selectedFeedOf(feeds, undefined)).toBe(feeds[0]);
    expect(selectedFeedOf(feeds, 'at://did:plc:x/app.bsky.feed.generator/z')).toBe(feeds[0]);
  });

  it('一覧が空なら undefined にする', () => {
    expect(selectedFeedOf([], FEED)).toBeUndefined();
  });
});

describe('unsavedFeedUriOf', () => {
  it('保存した一覧に無い feed と list の uri を返す', () => {
    const other = 'at://did:plc:x/app.bsky.feed.generator/z';
    const otherList = 'at://did:plc:x/app.bsky.graph.list/z';

    expect(unsavedFeedUriOf(feeds, other)).toBe(other);
    expect(unsavedFeedUriOf(feeds, otherList)).toBe(otherList);
  });

  it('保存済み、uri が無い、feed でも list でもない uri は undefined にする', () => {
    expect(unsavedFeedUriOf(feeds, FEED)).toBeUndefined();
    expect(unsavedFeedUriOf(feeds, undefined)).toBeUndefined();
    expect(unsavedFeedUriOf(feeds, 'at://did:plc:x/app.bsky.feed.post/1')).toBeUndefined();
    expect(unsavedFeedUriOf([], 'https://example.com')).toBeUndefined();
  });
});

describe('shownFeedsOf', () => {
  const unsaved: BlueskySavedFeedView = {
    uri: 'at://did:plc:x/app.bsky.feed.generator/z',
    kind: 'feed',
    pinned: false,
  };

  it('保存していない項目を先頭に足す', () => {
    expect(shownFeedsOf(feeds, unsaved)).toEqual([unsaved, ...feeds]);
  });

  it('保存していない項目が無い、または保存済みの一覧にあるときは一覧をそのまま返す', () => {
    expect(shownFeedsOf(feeds, undefined)).toBe(feeds);
    expect(shownFeedsOf(feeds, feeds[1])).toBe(feeds);
  });
});

describe('feedViewOfSearch と withFeedView', () => {
  it('view=members だけを members にし、それ以外は posts にする', () => {
    expect(feedViewOfSearch('?view=members')).toBe('members');
    expect(feedViewOfSearch('?view=posts')).toBe('posts');
    expect(feedViewOfSearch('?view=other')).toBe('posts');
    expect(feedViewOfSearch('')).toBe('posts');
  });

  it('members は view を付け、posts は view を外して、ほかのクエリを残す', () => {
    expect(withFeedView(`?uri=${encodeURIComponent(LIST)}`, 'members')).toBe(
      `?uri=${encodeURIComponent(LIST)}&view=members`,
    );
    expect(withFeedView('?uri=a&view=members', 'posts')).toBe('?uri=a');
    expect(withFeedView('?view=members', 'posts')).toBe('');
  });
});

describe('fallbackFeedUriOf', () => {
  it('一覧に無く、feed でも list でもない uri のときは先頭の項目の uri を返す', () => {
    expect(fallbackFeedUriOf(feeds, 'at://did:plc:x/app.bsky.feed.post/1')).toBe(FEED);
    expect(fallbackFeedUriOf(feeds, 'https://example.com')).toBe(FEED);
  });

  it('一覧に無くても feed か list と判定できる uri は undefined にする', () => {
    expect(fallbackFeedUriOf(feeds, 'at://did:plc:x/app.bsky.feed.generator/z')).toBeUndefined();
    expect(fallbackFeedUriOf(feeds, 'at://did:plc:x/app.bsky.graph.list/z')).toBeUndefined();
  });

  it('uri が一覧にあるときは undefined にする', () => {
    expect(fallbackFeedUriOf(feeds, LIST)).toBeUndefined();
  });

  it('uri が無いとき、または一覧が空のときは undefined にする', () => {
    expect(fallbackFeedUriOf(feeds, undefined)).toBeUndefined();
    expect(fallbackFeedUriOf([], 'https://example.com')).toBeUndefined();
  });
});
