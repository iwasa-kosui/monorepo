import { describe, expect, it } from 'vitest';

import { buildShareLinks } from './share-links';

describe('buildShareLinks', () => {
  const links = buildShareLinks('https://es.kosui.workers.dev/', 'タイトル 例');

  it('6つのサービスを決まった順序で返す', () => {
    expect(links.map((link) => link.id)).toEqual([
      'hatena',
      'x',
      'linkedin',
      'bluesky',
      'mastodon',
      'misskey',
    ]);
  });

  it('各サービスのリンク先を組み立てる', () => {
    expect(links.map((link) => link.href)).toEqual([
      'https://b.hatena.ne.jp/entry/s/es.kosui.workers.dev/',
      'https://x.com/intent/post?url=https%3A%2F%2Fes.kosui.workers.dev%2F&text=%E3%82%BF%E3%82%A4%E3%83%88%E3%83%AB%20%E4%BE%8B',
      'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fes.kosui.workers.dev%2F',
      'https://bsky.app/intent/compose?text=%E3%82%BF%E3%82%A4%E3%83%88%E3%83%AB%20%E4%BE%8B%20https%3A%2F%2Fes.kosui.workers.dev%2F',
      'https://donshare.net/share.html?text=%E3%82%BF%E3%82%A4%E3%83%88%E3%83%AB%20%E4%BE%8B%20https%3A%2F%2Fes.kosui.workers.dev%2F',
      'https://misskeyshare.link/share.html?text=%E3%82%BF%E3%82%A4%E3%83%88%E3%83%AB%20%E4%BE%8B%20https%3A%2F%2Fes.kosui.workers.dev%2F',
    ]);
  });
});
