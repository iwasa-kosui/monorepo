import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyActorBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { BlueskyFollowListRow } from './BlueskyFollowListRow.tsx';

const base: IoriBlueskyActorBody = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatar: null,
  description: null,
  followedByMe: false,
};

const render = (actor: Partial<IoriBlueskyActorBody>, viewerDid = 'did:plc:me'): string =>
  String(jsx(BlueskyFollowListRow, {
    actor: { ...base, ...actor },
    href: '/bluesky/profile/alice.bsky.social',
    viewerDid,
  }));

describe('BlueskyFollowListRow', () => {
  it('フォローしていない相手には「フォロー」のボタンを、リンクの外に出す', () => {
    const html = render({ followedByMe: false });

    expect(html).toContain('title="フォロー"');
    expect(html).toContain('aria-label="フォロー"');
    expect(html).not.toContain('title="フォロー解除"');
    expect(/<a [^>]*>[\s\S]*<\/a>/.exec(html)?.[0] ?? '').not.toContain('<button');
  });

  it('フォローしている相手には「フォロー解除」のボタンを出し、「フォロー中」のバッジは重ねない', () => {
    const html = render({ followedByMe: true });

    expect(html).toContain('title="フォロー解除"');
    expect(html).toContain('aria-label="フォロー解除"');
    expect(html).not.toContain('フォロー中');
  });

  it('自分の行にはボタンを出さない', () => {
    expect(render({ did: 'did:plc:me' })).not.toContain('<button');
  });

  it('処理中でない間はボタンを有効にする', () => {
    expect(render({})).not.toMatch(/\sdisabled(?=[\s>=])/);
  });
});
