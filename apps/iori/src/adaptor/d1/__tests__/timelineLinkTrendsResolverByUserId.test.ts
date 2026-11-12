import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { createD1TimelineLinkTrendsResolverByUserId } from '../linkPreview/timelineLinkTrendsResolverByUserId.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const viewer = seed.addLocalActor('viewer');
  const remote = seed.addRemoteActor('alice');
  seed.addFollow(viewer.actorId, remote.actorId);
  let linkId = 0;
  const addLink = (postId: string, url: string) =>
    fixture.sqlite.prepare(
      'INSERT INTO link_previews(linkPreviewId,postId,url,title,description,imageUrl,faviconUrl,siteName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(`link-${++linkId}`, postId, url, null, null, null, null, null, 2_000);
  const resolve = async () => {
    const result = await createD1TimelineLinkTrendsResolverByUserId(fixture.db).resolve({
      userId: viewer.userId as UserId,
      createdSince: Instant.orThrow(1_000),
      limit: 20,
    });
    if (!result.ok) throw new Error('unexpected');
    return result.val.map((trend) => trend.url).sort();
  };
  return { seed, viewer, remote, addLink, resolve };
};

describe('createD1TimelineLinkTrendsResolverByUserId', () => {
  it('フォロー中のリモート actor の direct と private の投稿のリンクは数えない', async () => {
    const { seed, remote, addLink, resolve } = setup();
    addLink(seed.addRemotePost(remote, 1_500, { visibility: 'direct' }).postId, 'https://example.com/direct');
    addLink(seed.addRemotePost(remote, 1_500, { visibility: 'private' }).postId, 'https://example.com/private');

    expect(await resolve()).toEqual([]);
  });

  it('フォロー中のリモート actor の public、unlisted、visibility が null の投稿のリンクは数える', async () => {
    const { seed, remote, addLink, resolve } = setup();
    addLink(seed.addRemotePost(remote, 1_500, { visibility: 'public' }).postId, 'https://example.com/public');
    addLink(seed.addRemotePost(remote, 1_500, { visibility: 'unlisted' }).postId, 'https://example.com/unlisted');
    addLink(seed.addRemotePost(remote, 1_500, { visibility: null }).postId, 'https://example.com/null');

    expect(await resolve()).toEqual([
      'https://example.com/null',
      'https://example.com/public',
      'https://example.com/unlisted',
    ]);
  });

  it('ローカルの投稿のリンクは数える', async () => {
    const { seed, viewer, addLink, resolve } = setup();
    addLink(seed.addLocalPost(viewer, 1_500).postId, 'https://example.com/local');

    expect(await resolve()).toEqual(['https://example.com/local']);
  });

  it('ローカルの private の投稿のリンクは数えず、unlisted の投稿のリンクは数える', async () => {
    const { seed, viewer, addLink, resolve } = setup();
    addLink(seed.addLocalPost(viewer, 1_500, { visibility: 'private' }).postId, 'https://example.com/private');
    addLink(seed.addLocalPost(viewer, 1_500, { visibility: 'unlisted' }).postId, 'https://example.com/unlisted');

    expect(await resolve()).toEqual(['https://example.com/unlisted']);
  });
});
