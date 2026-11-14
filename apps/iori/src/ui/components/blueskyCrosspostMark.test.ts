import { describe, expect, it } from 'vitest';

import type { IoriBlueskyCrosspost } from '../../adaptor/mastodon/entities.ts';
import {
  BLUESKY_CONTENT_WARNING_NOTICE,
  BLUESKY_SENSITIVE_NOTICE,
  blueskyCrosspostNotice,
  blueskyEditNotice,
  postedMessage,
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
  it('sent は url の有無にかかわらず undefined を返す', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'sent', retrying: false, url: 'https://bsky.app/x' })))
      .toBeUndefined();
    expect(toBlueskyCrosspostMark(crosspost({ status: 'sent', retrying: false }))).toBeUndefined();
  });

  it('pending は送信中にする', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'pending' }))).toMatchObject({
      kind: 'pending',
      label: 'Bluesky 送信中',
      emphasized: false,
    });
  });

  it('failed で再送が残っていれば再送待ちにする', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'failed', retrying: true }))).toMatchObject({
      kind: 'retrying',
      label: 'Bluesky 再送待ち',
      emphasized: false,
    });
  });

  it('failed で再送が残っていなければ強調する', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'failed', retrying: false }))).toMatchObject({
      kind: 'failed',
      label: 'Bluesky に届いていません',
      emphasized: true,
    });
  });

  it('skipped は title に理由を入れる', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'skipped', skip_reason: 'sensitive', retrying: false })))
      .toMatchObject({
        kind: 'skipped',
        label: 'Bluesky に未送信',
        title: 'この投稿の当時は、センシティブ指定の投稿を Bluesky に送っていませんでした',
      });
  });

  it('reply_to_unsent の skipped は印を出さない', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'skipped', skip_reason: 'reply_to_unsent', retrying: false })))
      .toBeUndefined();
  });

  it('direct の投稿の visibility の skipped は印を出さない', () => {
    expect(
      toBlueskyCrosspostMark(crosspost({ status: 'skipped', skip_reason: 'visibility', retrying: false }), 'direct'),
    ).toBeUndefined();
  });

  it('direct 以外の投稿の visibility の skipped は印を出す', () => {
    expect(
      toBlueskyCrosspostMark(crosspost({ status: 'skipped', skip_reason: 'visibility', retrying: false }), 'private'),
    ).toMatchObject({
      kind: 'skipped',
      label: 'Bluesky に未送信',
      title: '公開範囲が公開ではないため Bluesky に送っていません',
    });
  });

  it('deleting は何も出さない', () => {
    expect(toBlueskyCrosspostMark(crosspost({ status: 'deleting', retrying: false }))).toBeUndefined();
  });
});

describe('postedMessage', () => {
  it('Bluesky の情報が無ければ「投稿しました」', () => {
    expect(postedMessage('both', undefined)).toBe('投稿しました');
  });

  it('送り先が Fediverse だけなら「Fediverse に投稿しました」', () => {
    expect(postedMessage('fediverse', undefined)).toBe('Fediverse に投稿しました');
  });

  it('skipped なら理由を添える', () => {
    expect(postedMessage('both', crosspost({ status: 'skipped', skip_reason: 'content_warning', retrying: false })))
      .toBe(
        'Fediverse に投稿しました。Bluesky には送っていません（この投稿の当時は、CW 付きの投稿を Bluesky に送っていませんでした）',
      );
  });

  it('direct の投稿の visibility の skipped は理由を添えない', () => {
    expect(
      postedMessage('both', crosspost({ status: 'skipped', skip_reason: 'visibility', retrying: false }), 'direct'),
    ).toBe('Fediverse に投稿しました。Bluesky には送っていません');
  });
});

describe('blueskyCrosspostNotice', () => {
  it('送り先が両方で、CW があれば CW の文と投稿へのリンクだけを送る説明を返す', () => {
    expect(blueskyCrosspostNotice('both', '注意', false, 'public')).toBe(BLUESKY_CONTENT_WARNING_NOTICE);
    expect(blueskyCrosspostNotice('both', '注意', true, 'public')).toBe(BLUESKY_CONTENT_WARNING_NOTICE);
  });

  it('送り先が両方で、CW が無くセンシティブがオンなら画像に注意のラベルを付ける説明を返す', () => {
    expect(blueskyCrosspostNotice('both', '', true, 'public')).toBe(BLUESKY_SENSITIVE_NOTICE);
    expect(blueskyCrosspostNotice('both', '  ', true, 'public')).toBe(BLUESKY_SENSITIVE_NOTICE);
  });

  it('CW が空白だけでセンシティブがオフなら返さない', () => {
    expect(blueskyCrosspostNotice('both', '  ', false, 'public')).toBeUndefined();
  });

  it('送り先が Fediverse だけなら返さない', () => {
    expect(blueskyCrosspostNotice('fediverse', '注意', true, 'public')).toBeUndefined();
  });

  it.each(['unlisted', 'private'] as const)(
    '公開範囲が %s なら Bluesky に送らないので、CW やセンシティブがあっても返さない',
    (visibility) => {
      expect(blueskyCrosspostNotice('both', '', false, visibility)).toBeUndefined();
      expect(blueskyCrosspostNotice('both', '注意', true, visibility)).toBeUndefined();
    },
  );
});

describe('blueskyEditNotice', () => {
  const crosspost = (status: IoriBlueskyCrosspost['status']): IoriBlueskyCrosspost => ({
    status,
    skip_reason: status === 'skipped' ? 'visibility' : null,
    retrying: false,
    url: null,
  });

  it('Bluesky に送った投稿では、Bluesky は変わらず編集前の内容のまま残ると伝える', () => {
    expect(blueskyEditNotice({ iori: { reactions: [], link_previews: [], bluesky_crosspost: crosspost('sent') } }))
      .toBe('Bluesky に送った投稿は変わらず、編集前の内容のまま残ります');
  });

  it.each(['pending', 'failed'] as const)(
    'Bluesky の状態が %s なら、まだ送っておらず、送るときは編集後の内容を送ると伝える',
    (status) => {
      expect(blueskyEditNotice({ iori: { reactions: [], link_previews: [], bluesky_crosspost: crosspost(status) } }))
        .toBe('Bluesky にはまだ送っていません。送るときは編集後の内容を送ります');
    },
  );

  it.each(['skipped', 'deleting'] as const)('Bluesky の状態が %s なら伝えない', (status) => {
    expect(blueskyEditNotice({ iori: { reactions: [], link_previews: [], bluesky_crosspost: crosspost(status) } }))
      .toBeUndefined();
  });

  it('bluesky_crosspost が無いか iori が無ければ伝えない', () => {
    expect(blueskyEditNotice({ iori: { reactions: [], link_previews: [] } })).toBeUndefined();
    expect(blueskyEditNotice({})).toBeUndefined();
  });
});
