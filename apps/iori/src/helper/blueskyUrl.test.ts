import { describe, expect, it } from 'vitest';

import { blueskyPostUrl, blueskyPostUrlOfUri, ioriBlueskyPostPath } from './blueskyUrl.ts';

describe('blueskyPostUrl', () => {
  it('投稿者の DID と uri の末尾の rkey から bsky.app の URL を作る', () => {
    expect(blueskyPostUrl('did:plc:abc', 'at://did:plc:abc/app.bsky.feed.post/3kxyz')).toBe(
      'https://bsky.app/profile/did:plc:abc/post/3kxyz',
    );
  });

  it('DID の ":" をエンコードしない（報告された実データ）', () => {
    const url = blueskyPostUrl(
      'did:plc:v2wvabnlihirifdbbnx3gz4l',
      'at://did:plc:v2wvabnlihirifdbbnx3gz4l/app.bsky.feed.post/3mzsekoaun22i',
    );

    expect(url).toBe('https://bsky.app/profile/did:plc:v2wvabnlihirifdbbnx3gz4l/post/3mzsekoaun22i');
    expect(url).not.toContain('%3A');
  });

  it.each([
    ['did:plc:a/b'],
    ['did:plc:a?b'],
    ['did:plc:a#b'],
    ['did:plc:a b'],
    ['a/b.example'],
    ['a?b.example'],
    ['a#b.example'],
    ['a b.example'],
    ['handle.invalid'],
    [''],
  ])('不正な authority %j では URL にしない', (actor) => {
    expect(blueskyPostUrl(actor, 'at://did:plc:abc/app.bsky.feed.post/3kxyz')).toBeUndefined();
  });

  it('at:// の形でない uri は URL にしない', () => {
    expect(blueskyPostUrl('did:plc:abc', 'https://example.com/x')).toBeUndefined();
    expect(blueskyPostUrlOfUri('nope')).toBeUndefined();
  });

  it('uri の DID から URL を作る（引用用）', () => {
    expect(blueskyPostUrlOfUri('at://did:plc:q/app.bsky.feed.post/3kq')).toBe(
      'https://bsky.app/profile/did:plc:q/post/3kq',
    );
  });

  it('authority が handle の uri からも URL を作る', () => {
    expect(blueskyPostUrlOfUri('at://alice.bsky.social/app.bsky.feed.post/3kq')).toBe(
      'https://bsky.app/profile/alice.bsky.social/post/3kq',
    );
  });
});

describe('ioriBlueskyPostPath', () => {
  it('at-uri から iori 内の詳細ページの path を作る', () => {
    expect(ioriBlueskyPostPath('at://did:plc:q/app.bsky.feed.post/3kq')).toBe('/bluesky/profile/did:plc:q/post/3kq');
  });

  it('DID でない authority や at-uri でない文字列は undefined にする', () => {
    expect(ioriBlueskyPostPath('at://alice.bsky.social/app.bsky.feed.post/3kq')).toBeUndefined();
    expect(ioriBlueskyPostPath('https://example.com/x')).toBeUndefined();
    expect(ioriBlueskyPostPath('nope')).toBeUndefined();
  });
});
