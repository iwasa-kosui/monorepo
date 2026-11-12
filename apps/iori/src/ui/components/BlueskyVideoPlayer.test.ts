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
  it('最初はサムネイルと再生ボタンだけを出し、動画を読み込まない', () => {
    const html = render();

    expect(html).toContain('<img src="https://video.example/thumb.jpg"');
    expect(html).toMatch(/<button type="button" aria-label="動画を再生"/);
    expect(html).not.toContain('<video');
    expect(html).not.toContain('m3u8');
    expect(html).not.toContain('bsky.app');
  });

  it('aspectRatio があればその比率、無ければ 16 / 9 を aspect-ratio にする', () => {
    expect(render()).toContain('style="aspect-ratio: 9 / 16"');
    expect(render({ aspectRatio: null })).toContain('style="aspect-ratio: 16 / 9"');
  });

  it('縦長の動画が画面からはみ出さないよう最大の高さを付ける', () => {
    expect(render()).toContain('max-h-96');
  });

  it('alt をサムネイルの alt にし、無ければ「動画」にする', () => {
    expect(render()).toContain('alt="走る猫"');
    expect(render({ alt: null })).toContain('alt="動画"');
  });

  it('サムネイルが無ければ img を出さず、再生ボタンは出す', () => {
    const html = render({ thumbnail: null });

    expect(html).not.toContain('<img');
    expect(html).toContain('aria-label="動画を再生"');
  });

  it('playlist が http/https でなければ再生ボタンを出さず、bsky.app のリンクにする', () => {
    const html = render({ playlist: 'javascript:alert(1)' });

    expect(html).not.toContain('<button');
    expect(html).toContain(
      '<a href="https://bsky.app/profile/did:plc:author/post/3kabc" target="_blank" rel="noopener noreferrer"',
    );
  });
});
