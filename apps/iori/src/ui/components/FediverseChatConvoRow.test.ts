import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriFediverseConversationBody } from '../../adaptor/routes/workerIoriFediverseConversationsRouter.ts';
import { FediverseChatConvoRow } from './FediverseChatConvoRow.tsx';

const NOW = Date.UTC(2026, 10, 12, 3, 0);

const peer = {
  accountId: 'actor-alice',
  actorUri: 'https://remote.example/users/alice',
  acct: 'alice@remote.example',
  displayName: 'Alice',
  avatar: 'https://iori.test/avatars/alice.png',
  path: '/remote-users/actor-alice',
};

const base: IoriFediverseConversationBody = {
  key: 'WyJhIl0',
  peers: [peer],
  lastMessage: { text: 'こんにちは', sentAt: NOW, own: false },
  unreadCount: 0,
};

const render = (overrides: Partial<IoriFediverseConversationBody> = {}): string =>
  String(jsx(FediverseChatConvoRow, { conversation: { ...base, ...overrides }, now: NOW }));

describe('FediverseChatConvoRow', () => {
  it('安全でないアバターの URL は使わず、頭文字にする', () => {
    const html = render({ peers: [{ ...peer, avatar: 'javascript:alert(1)' }] });

    expect(html).not.toContain('javascript:');
    expect(html).toContain('>A<');
  });
});
