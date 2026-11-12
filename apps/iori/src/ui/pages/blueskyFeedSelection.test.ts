import { describe, expect, it } from 'vitest';

import type { BlueskySavedFeedView } from '../api/blueskyFeedClient.ts';
import { feedUriOfSearch, selectedFeedOf, withFeedUri } from './blueskyFeedSelection.ts';

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
