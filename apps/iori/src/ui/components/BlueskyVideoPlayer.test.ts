import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { BlueskyVideoPlayer } from './BlueskyVideoPlayer.tsx';

const props = {
  thumbnail: 'https://video.example/thumb.jpg',
  playlist: 'https://video.example/playlist.m3u8',
  aspectRatio: { width: 9, height: 16 },
  alt: '走る猫',
  bskyHref: 'https://bsky.app/profile/did:plc:author/post/3kabc',
};
const render = (overrides: Partial<Parameters<typeof BlueskyVideoPlayer>[0]> = {}): string =>
  String(jsx(BlueskyVideoPlayer, { ...props, ...overrides }));

describe('BlueskyVideoPlayer', () => {
  it('playlist が http/https でなければ再生ボタンを出さず、bsky.app のリンクにする', () => {
    const html = render({ playlist: 'javascript:alert(1)' });

    expect(html).not.toContain('<button');
    expect(html).toMatch(
      /<a [^>]*href="https:\/\/bsky\.app\/profile\/did:plc:author\/post\/3kabc" target="_blank" rel="noopener noreferrer"/,
    );
  });
});
