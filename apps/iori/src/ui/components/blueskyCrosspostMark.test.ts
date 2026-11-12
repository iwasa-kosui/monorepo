import { describe, expect, it } from 'vitest';

import type { IoriBlueskyCrosspost } from '../../adaptor/mastodon/entities.ts';
import {
  BLUESKY_CONTENT_WARNING_NOTICE,
  BLUESKY_SENSITIVE_NOTICE,
  blueskyCrosspostNotice,
  postedMessage,
  skipReasonText,
  toBlueskyCrosspostMark,
} from './blueskyCrosspostMark.ts';

const crosspost = (overrides: Partial<IoriBlueskyCrosspost>): IoriBlueskyCrosspost => ({
  status: 'pending',
  skip_reason: null,
  retrying: true,
  url: null,
  ...overrides,
});

describe('toBlueskyCrosspostMark', () => {
  it('sent は URL へのリンクにする', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'sent', retrying: false, url: 'https://bsky.app/x' })))
      .toMatchObject({ label: 'Bluesky', href: 'https://bsky.app/x', emphasized: false });
  });

  it('sent で URL が無ければリンクにしない', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'sent', retrying: false }))).toMatchObject({
      label: 'Bluesky',
      href: null,
    });
  });

  it('pending は送信中にする', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'pending' }))).toMatchObject({
      label: 'Bluesky 送信中',
      emphasized: false,
    });
  });

  it('failed で再送が残っていれば再送待ちにする', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'failed', retrying: true }))).toMatchObject({
      label: 'Bluesky 再送待ち',
      emphasized: false,
    });
  });

  it('failed で再送が残っていなければ強調する', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'failed', retrying: false }))).toMatchObject({
      label: 'Bluesky に届いていません',
      emphasized: true,
    });
  });

  it('skipped は title に理由を入れる', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'skipped', skip_reason: 'sensitive', retrying: false })))
      .toMatchObject({
        label: 'Bluesky に未送信',
        title: 'センシティブ指定の投稿は Bluesky に送りません',
      });
  });

  it('content_warning の skipped は印を出す', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'skipped', skip_reason: 'content_warning', retrying: false })))
      .toMatchObject({
        label: 'Bluesky に未送信',
        title: 'CW 付きの投稿は Bluesky に送りません',
      });
  });

  it('reply_to_unsent の skipped は印を出さない', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'skipped', skip_reason: 'reply_to_unsent', retrying: false })))
      .toBeUndefined();
  });

  it('deleting は何も出さない', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'deleting', retrying: false }))).toBeUndefined();
  });
});

describe('skipReasonText', () => {
  it.each(
    [
      ['content_warning', 'CW 付きの投稿は Bluesky に送りません'],
      ['sensitive', 'センシティブ指定の投稿は Bluesky に送りません'],
      ['reply_to_unsent', '返信先が Bluesky にないため送っていません'],
    ] as const,
  )('%s の文言を返す', (reason, text) => {
    expect(skipReasonText(reason)).toBe(text);
  });

  it('理由が無ければ undefined', () => {
    expect(skipReasonText(null)).toBeUndefined();
  });
});

describe('postedMessage', () => {
  it('Bluesky の情報が無ければ「投稿しました」', () => {
    expect(postedMessage('both', undefined)).toBe('投稿しました');
  });

  it('送り先が Fediverse だけなら「Fediverse に投稿しました」', () => {
    expect(postedMessage('fediverse', undefined)).toBe('Fediverse に投稿しました');
  });

  it('pending なら送信中だと伝える', () => {
    expect(postedMessage('both', crosspost({ status: 'pending' }))).toBe('投稿しました。Bluesky には送信中です');
  });

  it('sent なら Bluesky にも送ったと伝える', () => {
    expect(postedMessage('both', crosspost({ status: 'sent', retrying: false, url: 'https://bsky.app/x' })))
      .toBe('投稿しました（Bluesky にも送りました）');
  });

  it('failed で再送が残っていれば、あとで再送すると伝える', () => {
    expect(postedMessage('both', crosspost({ status: 'failed', retrying: true })))
      .toBe('投稿しました。Bluesky への送信に失敗しました（あとで再送します）');
  });

  it('failed で再送が残っていなければ、Bluesky に届いていないと伝える', () => {
    expect(postedMessage('both', crosspost({ status: 'failed', retrying: false })))
      .toBe('投稿しました。Bluesky には届いていません');
  });

  it('skipped なら理由を添える', () => {
    expect(postedMessage('both', crosspost({ status: 'skipped', skip_reason: 'content_warning', retrying: false })))
      .toBe('Fediverse に投稿しました。Bluesky には送っていません（CW 付きの投稿は Bluesky に送りません）');
  });
});

describe('blueskyCrosspostNotice', () => {
  it('送り先が両方で、CW があれば CW の文と投稿へのリンクだけを送る説明を返す', () => {
    expect(blueskyCrosspostNotice('both', '注意', false)).toBe(BLUESKY_CONTENT_WARNING_NOTICE);
    expect(blueskyCrosspostNotice('both', '注意', true)).toBe(BLUESKY_CONTENT_WARNING_NOTICE);
    expect(BLUESKY_CONTENT_WARNING_NOTICE).toBe('Bluesky には CW の文と投稿へのリンクだけを送ります');
  });

  it('送り先が両方で、CW が無くセンシティブがオンなら画像に注意のラベルを付ける説明を返す', () => {
    expect(blueskyCrosspostNotice('both', '', true)).toBe(BLUESKY_SENSITIVE_NOTICE);
    expect(blueskyCrosspostNotice('both', '  ', true)).toBe(BLUESKY_SENSITIVE_NOTICE);
    expect(BLUESKY_SENSITIVE_NOTICE).toBe('Bluesky には画像に注意のラベルを付けて送ります');
  });

  it('CW が空白だけでセンシティブがオフなら返さない', () => {
    expect(blueskyCrosspostNotice('both', '  ', false)).toBeUndefined();
  });

  it('送り先が Fediverse だけなら返さない', () => {
    expect(blueskyCrosspostNotice('fediverse', '注意', true)).toBeUndefined();
  });
});
