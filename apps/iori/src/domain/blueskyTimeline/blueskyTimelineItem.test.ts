import { describe, expect, it } from 'vitest';

import { BlueskyTimelineEmbed } from './blueskyTimelineItem.ts';

describe('BlueskyTimelineEmbed の video', () => {
  it('aspectRatio と alt を持たない保存済みの embed は、どちらも null として読める', () => {
    expect(
      BlueskyTimelineEmbed.parseOrThrow({
        type: 'video',
        thumbnail: null,
        playlist: 'https://video.example/playlist.m3u8',
      }),
    ).toEqual({
      type: 'video',
      thumbnail: null,
      playlist: 'https://video.example/playlist.m3u8',
      aspectRatio: null,
      alt: null,
    });
  });

  it('aspectRatio が正の整数でなければ読めない', () => {
    const video = { type: 'video', thumbnail: null, playlist: 'https://video.example/playlist.m3u8' };

    expect(BlueskyTimelineEmbed.parse({ ...video, aspectRatio: { width: 0, height: 9 } }).ok).toBe(false);
    expect(BlueskyTimelineEmbed.parse({ ...video, aspectRatio: { width: 16, height: 9 }, alt: '猫' }).ok).toBe(true);
  });
});
