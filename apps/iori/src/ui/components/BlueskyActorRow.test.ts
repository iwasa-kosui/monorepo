import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyActorBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { actorDescriptionExcerpt, BlueskyActorRow } from './BlueskyActorRow.tsx';

const base: IoriBlueskyActorBody = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatar: 'https://cdn.example/alice.jpg',
  description: 'こんにちは',
  followedByMe: false,
};
const render = (actor: Partial<IoriBlueskyActorBody>): string =>
  String(jsx(BlueskyActorRow, { actor: { ...base, ...actor } }));

describe('BlueskyActorRow', () => {
  it('表示名、@handle、プロフィール文、アバターを出す', () => {
    const html = render({});

    expect(html).toContain('Alice');
    expect(html).toContain('@alice.bsky.social');
    expect(html).toContain('こんにちは');
    expect(html).toContain('src="https://cdn.example/alice.jpg"');
  });

  it('DID で組み立てた bsky.app のプロフィールへ、新しいタブで開くリンクにする', () => {
    const html = render({});

    expect(html).toContain('href="https://bsky.app/profile/did:plc:alice"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('フォロー中のときだけ「フォロー中」を出す', () => {
    expect(render({ followedByMe: true })).toContain('フォロー中');
    expect(render({ followedByMe: false })).not.toContain('フォロー中');
  });

  it('表示名が無いときは handle を名前として出し、アバターが無いときは頭文字を出す', () => {
    const html = render({ displayName: null, avatar: null });

    expect(html).toContain('>alice.bsky.social<');
    expect(html).toContain('>A<');
    expect(html).not.toContain('<img');
  });

  it('プロフィール文が無いときは本文の行を出さない', () => {
    expect(render({ description: null })).not.toContain('mt-1');
  });

  it('http と https 以外のアバターの URL は使わない', () => {
    expect(render({ avatar: 'javascript:alert(1)' })).not.toContain('<img');
  });
});

describe('actorDescriptionExcerpt', () => {
  it('改行と連続する空白を 1 つの空白にまとめる', () => {
    expect(actorDescriptionExcerpt('a\n\n b   c')).toBe('a b c');
  });

  it('null は空文字にする', () => {
    expect(actorDescriptionExcerpt(null)).toBe('');
  });

  it('120 文字を超えるときは 120 文字で切って … を付ける', () => {
    const excerpt = actorDescriptionExcerpt('あ'.repeat(121));

    expect(excerpt).toBe(`${'あ'.repeat(120)}…`);
  });

  it('120 文字ちょうどなら切らない', () => {
    expect(actorDescriptionExcerpt('あ'.repeat(120))).toBe('あ'.repeat(120));
  });
});
