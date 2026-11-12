import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { BlueskySavedFeedView } from '../api/blueskyFeedClient.ts';
import { BlueskyFeedRow } from './BlueskyFeedRow.tsx';

const FEED = 'at://did:plc:gen/app.bsky.feed.generator/hot';
const base: BlueskySavedFeedView = {
  uri: FEED,
  kind: 'feed',
  pinned: false,
  displayName: 'Hot',
  avatar: 'https://cdn.example/g.jpg',
  description: 'みんなの話題',
  creatorHandle: 'gen.bsky.social',
};
const render = (feed: Partial<BlueskySavedFeedView> = {}): string =>
  String(jsx(BlueskyFeedRow, { feed: { ...base, ...feed } }));

describe('BlueskyFeedRow', () => {
  it('名前、作者の @handle、説明、アイコンを出す', () => {
    const html = render();

    expect(html).toContain('Hot');
    expect(html).toContain('@gen.bsky.social');
    expect(html).toContain('みんなの話題');
    expect(html).toContain('src="https://cdn.example/g.jpg"');
  });

  it('/feeds?uri= へのサイト内リンクにする', () => {
    const html = render();

    expect(html).toContain(`href="/feeds?uri=${encodeURIComponent(FEED)}"`);
    expect(html).not.toContain('target="_blank"');
  });

  it('名前、アイコン、説明、作者が無いときは、名前の代わりの文言と頭文字を出し、ほかは出さない', () => {
    const html = render({
      displayName: undefined,
      avatar: undefined,
      description: undefined,
      creatorHandle: undefined,
    });

    expect(html).toContain('名前を取得できなかったフィード');
    expect(html).toContain('>名<');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('@');
    expect(html).not.toContain('mt-1');
  });
});
