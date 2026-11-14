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
  it('http と https 以外のアバターの URL は使わない', () => {
    expect(render({ avatar: 'javascript:alert(1)' })).not.toContain('<img');
  });
});

describe('actorDescriptionExcerpt', () => {
  it('改行と連続する空白を 1 つの空白にまとめる', () => {
    expect(actorDescriptionExcerpt('a\n\n b   c')).toBe('a b c');
  });

  it('120 文字を超えるときは 120 文字で切って … を付ける', () => {
    const excerpt = actorDescriptionExcerpt('あ'.repeat(121));

    expect(excerpt).toBe(`${'あ'.repeat(120)}…`);
  });

  it('120 文字ちょうどなら切らない', () => {
    expect(actorDescriptionExcerpt('あ'.repeat(120))).toBe('あ'.repeat(120));
  });
});
