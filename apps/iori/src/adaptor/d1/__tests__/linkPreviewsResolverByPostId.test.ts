import { describe, expect, it } from 'vitest';

import type { PostId } from '../../../domain/post/postId.ts';
import { createD1LinkPreviewsResolverByPostId } from '../linkPreview/linkPreviewsResolverByPostId.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const remote = seed.addRemoteActor('alice');
  return { fixture, seed, remote };
};

describe('createD1LinkPreviewsResolverByPostId', () => {
  it('指定した投稿のリンクプレビューだけを返す', async () => {
    const { fixture, seed, remote } = setup();
    const target = seed.addRemotePost(remote, 1_000);
    const other = seed.addRemotePost(remote, 1_000);
    seed.addLinkPreview(target.postId, 'https://example.com/a', 'Site A', null);
    seed.addLinkPreview(other.postId, 'https://example.com/b', 'Site B', null);

    const result = await createD1LinkPreviewsResolverByPostId(fixture.db).resolve(target.postId as PostId);

    expect(result.ok && result.val).toMatchObject([
      { postId: target.postId, url: 'https://example.com/a', siteName: 'Site A' },
    ]);
  });

  it('リンクプレビューが無い投稿には空配列を返す', async () => {
    const { fixture, seed, remote } = setup();
    const post = seed.addRemotePost(remote, 1_000);

    const result = await createD1LinkPreviewsResolverByPostId(fixture.db).resolve(post.postId as PostId);

    expect(result).toEqual({ ok: true, val: [] });
  });
});
