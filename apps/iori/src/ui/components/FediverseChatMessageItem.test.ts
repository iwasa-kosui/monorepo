import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { FediverseChatMessageItem } from './FediverseChatMessageItem.tsx';

const NOW = Date.parse('2026-11-12T03:00:00.000Z');

const message = (overrides: Partial<Status> = {}): Status =>
  ({
    id: 'm1',
    created_at: '2026-11-12T02:30:00.000Z',
    content: '<p>こんにちは <a href="https://remote.example/@alice">@alice</a></p>',
    spoiler_text: '',
    sensitive: false,
    media_attachments: [],
    ...overrides,
  }) as unknown as Status;

const render = (status: Status, own = false): string =>
  String(jsx(FediverseChatMessageItem, { message: status, own, now: NOW }));

describe('FediverseChatMessageItem', () => {
  it('添付画像を、安全な URL のものだけ img で出し、altText を alt にする', () => {
    const html = render(
      message({
        media_attachments: [
          { type: 'image', url: 'https://iori.test/uploads/a.png', description: '猫' },
          { type: 'image', url: 'javascript:alert(1)', description: null },
        ] as Status['media_attachments'],
      }),
    );

    expect(html).toContain('src="https://iori.test/uploads/a.png"');
    expect(html).toContain('alt="猫"');
    expect(html).not.toContain('javascript:');
  });
});
