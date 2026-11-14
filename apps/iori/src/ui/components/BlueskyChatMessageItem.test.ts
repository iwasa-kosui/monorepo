import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyChatMessageBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { BlueskyChatMessageItem } from './BlueskyChatMessageItem.tsx';

const NOW = Date.UTC(2026, 10, 12, 3, 0);

const text = (overrides: Partial<Extract<IoriBlueskyChatMessageBody, { kind: 'message' }>> = {}) => ({
  kind: 'message' as const,
  id: 'm1',
  text: 'こんにちは',
  facets: [],
  hasEmbed: false,
  sharedPost: null,
  reactions: [],
  senderDid: 'did:plc:alice',
  sentAt: NOW,
  ...overrides,
});

const render = (message: IoriBlueskyChatMessageBody, own = false): string =>
  String(jsx(BlueskyChatMessageItem, { message, own, now: NOW }));

describe('BlueskyChatMessageItem', () => {
  it('共有された投稿を引用カードにし、iori の中の投稿の詳細へリンクして bsky.app へは飛ばさない', () => {
    const html = render(text({
      text: '',
      sharedPost: {
        uri: 'at://did:plc:bob/app.bsky.feed.post/3kpost',
        authorHandle: 'bob.bsky.social',
        authorDisplayName: 'Bob',
        text: '共有された本文',
      },
    }));

    expect(html).toContain('data-testid="bluesky-chat-shared-post"');
    expect(html).toContain('href="/bluesky/profile/did:plc:bob/post/3kpost"');
    expect(html).toContain('共有された本文');
    expect(html).toContain('Bob @bob.bsky.social');
    expect(html).not.toContain('bsky.app');
  });

  it('投稿の詳細のパスにできない URI は作者の iori のプロフィールへリンクする', () => {
    const html = render(text({
      sharedPost: { uri: 'at://x/y', authorHandle: 'bob.bsky.social', authorDisplayName: null, text: 'a' },
    }));

    expect(html).toContain('href="/bluesky/profile/bob.bsky.social"');
  });

  it('リアクションを値ごとにまとめて出し、無ければ出さない', () => {
    const html = render(text({
      reactions: [
        { value: '👍', senderDid: 'a' },
        { value: '👍', senderDid: 'b' },
        { value: '❤️', senderDid: 'a' },
      ],
    }));

    expect(html).toContain('data-testid="bluesky-chat-reactions"');
    expect(html).toContain('👍 2');
    expect(html).toContain('❤️');
    expect(render(text())).not.toContain('bluesky-chat-reactions');
  });
});
