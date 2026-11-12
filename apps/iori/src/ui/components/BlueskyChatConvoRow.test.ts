import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyChatConvoBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { BlueskyChatConvoRow } from './BlueskyChatConvoRow.tsx';

const NOW = Date.UTC(2026, 10, 12, 3, 0);

const base: IoriBlueskyChatConvoBody = {
  id: '3kconvo',
  rev: 'r1',
  peers: [{
    did: 'did:plc:alice',
    handle: 'alice.bsky.social',
    displayName: 'Alice',
    avatar: 'https://cdn.example/alice.jpg',
    chatDisabled: false,
  }],
  lastMessage: { kind: 'message', text: 'こんにちは', senderDid: 'did:plc:alice', sentAt: NOW },
  muted: false,
  status: 'accepted',
  unreadCount: 0,
};

const render = (overrides: Partial<IoriBlueskyChatConvoBody> = {}): string =>
  String(jsx(BlueskyChatConvoRow, { convo: { ...base, ...overrides }, now: NOW }));

describe('BlueskyChatConvoRow', () => {
  it('相手のアバター、表示名、ハンドル、最後のメッセージを出し、会話のページへリンクする', () => {
    const html = render();

    expect(html).toContain('href="/messages/3kconvo"');
    expect(html).toContain('src="https://cdn.example/alice.jpg"');
    expect(html).toContain('Alice');
    expect(html).toContain('@alice.bsky.social');
    expect(html).toContain('こんにちは');
  });

  it('未読があるときだけ未読数のバッジを出し、ミュート中のときだけミュート表示を出す', () => {
    expect(render({ unreadCount: 3 })).toContain('aria-label="未読のメッセージ"');
    expect(render({ unreadCount: 0 })).not.toContain('aria-label="未読のメッセージ"');
    expect(render({ muted: true })).toContain('ミュート中');
    expect(render({ muted: false })).not.toContain('ミュート中');
  });

  it('削除済みと未対応の最後のメッセージを要約に置き換える', () => {
    expect(render({ lastMessage: { kind: 'deleted', text: null, senderDid: 'did:plc:alice', sentAt: NOW } }))
      .toContain('削除されたメッセージ');
    expect(render({ lastMessage: { kind: 'unsupported', text: null, senderDid: null, sentAt: NOW } }))
      .toContain('表示できないメッセージ');
  });
});
