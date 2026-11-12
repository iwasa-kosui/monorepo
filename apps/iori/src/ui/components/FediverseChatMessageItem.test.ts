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
  it('サーバーでサニタイズ済みの HTML を、そのまま本文として描画する', () => {
    const html = render(message());

    expect(html).toContain('<p>こんにちは <a href="https://remote.example/@alice">@alice</a></p>');
    expect(html).toContain('data-testid="fediverse-chat-message"');
  });

  it('自分のメッセージは右寄せ、相手のメッセージは左寄せにする', () => {
    expect(render(message(), true)).toContain('justify-end');
    expect(render(message(), false)).toContain('justify-start');
  });

  it('送信日時を time 要素で出す', () => {
    const html = render(message());

    expect(html).toContain('dateTime="2026-11-12T02:30:00.000Z"');
  });

  it('日時が読めないときは time 要素を出さない', () => {
    expect(render(message({ created_at: 'nope' }))).not.toContain('<time');
  });

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

  it('動画と音声を、再生できる要素で出す', () => {
    const html = render(
      message({
        media_attachments: [
          { type: 'video', url: 'https://iori.test/uploads/v.mp4', description: null },
          { type: 'audio', url: 'https://iori.test/uploads/a.mp3', description: null },
        ] as Status['media_attachments'],
      }),
    );

    expect(html).toContain('<video');
    expect(html).toContain('<audio');
  });

  it('CW があるときは details に包み、本文は開くまで畳む', () => {
    const html = render(message({ spoiler_text: 'ネタバレ' }));

    expect(html).toContain('data-testid="fediverse-chat-spoiler"');
    expect(html).toContain('ネタバレ');
  });

  it('センシティブな添付は details に包んで畳み、本文は畳まない', () => {
    const html = render(
      message({
        sensitive: true,
        media_attachments: [{
          type: 'image',
          url: 'https://iori.test/uploads/a.png',
          description: null,
        }] as Status['media_attachments'],
      }),
    );

    expect(html).toContain('センシティブなメディアを表示');
    expect(html).not.toContain('data-testid="fediverse-chat-spoiler"');
  });

  it('長い本文が 360px の幅を押し広げないよう、折り返しと最大幅を指定する', () => {
    const html = render(message());

    expect(html).toContain('max-w-[85%]');
    expect(html).toContain('break-words');
  });
});
