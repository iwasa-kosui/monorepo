import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type {
  BlueskyAccountSwitchState,
  BlueskyCredentialStatus,
  BlueskyDidMismatch,
} from '../api/blueskyCredentialClient.ts';
import {
  AccountSwitchConfirmView,
  AccountSwitchStatusView,
  BlueskyCredentialStatusView,
  CredentialFormView,
} from './BlueskyCredentialSection.tsx';

const status: BlueskyCredentialStatus = {
  source: 'settings',
  handle: 'kosui.bsky.social',
  did: 'did:plc:abc',
  chatPermitted: true,
  verifiedAt: null,
  registrable: true,
};

const statusHtml = (overrides: Partial<BlueskyCredentialStatus>) =>
  String(jsx(BlueskyCredentialStatusView, { status: { ...status, ...overrides } }));

describe('BlueskyCredentialStatusView', () => {
  it('出どころ、ハンドル、DID、DM を出す', () => {
    const html = statusHtml({});

    expect(html).toContain('設定画面で登録');
    expect(html).toContain('kosui.bsky.social');
    expect(html).toContain('did:plc:abc');
    expect(html).toContain('使えます');
  });

  it('chatPermitted が false のときだけ、アプリパスワードを作り直す案内を出す', () => {
    expect(statusHtml({ chatPermitted: false })).toContain('DM へのアクセスを許可');
    expect(statusHtml({ chatPermitted: true })).not.toContain('DM へのアクセスを許可');
    expect(statusHtml({ chatPermitted: null })).not.toContain('DM へのアクセスを許可');
  });
});

describe('CredentialFormView', () => {
  const formHtml = (overrides: { submitting?: boolean; error?: string; saved?: boolean }) =>
    String(
      jsx(CredentialFormView, {
        identifier: '',
        appPassword: '',
        currentPassword: '',
        submitting: false,
        error: undefined,
        saved: false,
        onIdentifierInput: () => {},
        onAppPasswordInput: () => {},
        onCurrentPasswordInput: () => {},
        onSubmit: () => {},
        ...overrides,
      }),
    );

  it('3つの入力欄に autocomplete を付ける', () => {
    const html = formHtml({});

    expect(html).toContain('autocomplete="off"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('確かめて保存');
  });

  it('送信中はボタンを無効にする', () => {
    expect(formHtml({ submitting: true })).toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
    expect(formHtml({ submitting: false })).not.toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
  });

  it('エラーと保存済みの表示を出し分ける', () => {
    expect(formHtml({ error: 'iori のパスワードが違います。' })).toContain('iori のパスワードが違います。');
    expect(formHtml({ saved: true })).toContain('保存しました');
    expect(formHtml({})).not.toContain('保存しました');
  });
});

describe('AccountSwitchConfirmView', () => {
  const mismatch: BlueskyDidMismatch = {
    current: { did: 'did:plc:old', handle: 'old.bsky.social' },
    next: { did: 'did:plc:new', handle: 'new.bsky.social' },
  };
  const counts = {
    timelineItems: 11,
    notifications: 22,
    likes: 33,
    reposts: 44,
    bookmarks: 55,
    moderatedActors: 66,
    crossposts: 77,
  };

  type Overrides = Partial<Parameters<typeof AccountSwitchConfirmView>[0]>;

  const confirmHtml = (overrides: Overrides) =>
    String(
      jsx(AccountSwitchConfirmView, {
        mismatch,
        preview: { kind: 'ready', counts },
        confirmHandle: '',
        currentPassword: '',
        submitting: false,
        error: undefined,
        onConfirmHandleInput: () => {},
        onCurrentPasswordInput: () => {},
        onSubmit: () => {},
        onCancel: () => {},
        onRetryPreview: () => {},
        ...overrides,
      }),
    );

  const submitButton = (html: string) => /<button type="submit"[^>]*>/.exec(html)?.[0] ?? '';
  const buttonLabeled = (html: string, label: string) =>
    new RegExp(`<button type="button"[^>]*>\\s*${label}`).exec(html)?.[0] ?? '';
  const cancelButton = (html: string) => buttonLabeled(html, 'やめる');
  const isDisabled = (tag: string) => /\sdisabled(?:=|\s|>)/.test(tag);

  it('いまのアカウントと新しいアカウントのハンドルを出す', () => {
    const html = confirmHtml({});

    expect(html).toContain('アカウントの切り替え');
    expect(html).toContain('old.bsky.social');
    expect(html).toContain('new.bsky.social');
    expect(html).not.toContain('did:plc:old');
  });

  it('いまのアカウントのハンドルが無ければ DID を出す', () => {
    const html = confirmHtml({ mismatch: { ...mismatch, current: { did: 'did:plc:old', handle: null } } });

    expect(html).toContain('did:plc:old');
  });

  it('件数を決まった順に出す', () => {
    const html = confirmHtml({});
    const labels = [
      'タイムライン',
      '通知',
      'いいね',
      'リポスト',
      'ブックマーク',
      'ミュートとブロック',
      'クロスポストの対応',
    ];
    const positions = labels.map((label) => html.indexOf(`>${label}<`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const count of [11, 22, 33, 44, 55, 66, 77]) expect(html).toContain(`${count} 件`);
  });

  it('読み込み中と失敗を出し分ける', () => {
    const loading = confirmHtml({ preview: { kind: 'loading' } });
    const failed = confirmHtml({ preview: { kind: 'error' } });

    expect(loading).toContain('削除する件数を読み込んでいます');
    expect(loading).not.toContain('件</');
    expect(failed).toContain('件数を読み込めませんでした。');
    expect(confirmHtml({})).not.toContain('読み込んでいます');
  });

  it('消えるものと消えないものを明記する', () => {
    const html = confirmHtml({});

    expect(html).toContain('削除の対象には、iori の中のブックマーク、ミュート、ブロックも入ります。');
    expect(html).toContain(
      '自分の投稿と前の Bluesky の投稿との結び付き（送信済みのアイコンのリンクと、引用のときの Bluesky の引用）も消えます。',
    );
    expect(html).toContain('前のアカウントの Bluesky 上の投稿、いいね、フォローは残ります。');
    expect(html).toContain('iori の投稿と Fediverse のデータは消えません。');
    expect(html).toContain('前のアカウントに送った投稿は、新しいアカウントには送り直しません。');
  });

  it('パスワードの欄に autocomplete を付け、ブラウザのダイアログを使わない', () => {
    const html = confirmHtml({});

    expect(html).toContain('確認のため、新しいアカウントのハンドルを入力してください');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).not.toContain('confirm(');
  });

  it('ハンドルが一致するまで、送信ボタンを無効にする', () => {
    expect(isDisabled(submitButton(confirmHtml({ confirmHandle: '' })))).toBe(true);
    expect(isDisabled(submitButton(confirmHtml({ confirmHandle: 'new.bsky' })))).toBe(true);
    expect(isDisabled(submitButton(confirmHtml({ confirmHandle: 'new.bsky.social' })))).toBe(false);
    expect(isDisabled(submitButton(confirmHtml({ confirmHandle: ' @NEW.bsky.social ' })))).toBe(false);
    expect(confirmHtml({})).toContain('切り替えてデータを消す');
  });

  it('件数の読み込み中と失敗のあいだは、ハンドルが一致していても送信ボタンを無効にする', () => {
    const confirmHandle = 'new.bsky.social';

    expect(isDisabled(submitButton(confirmHtml({ confirmHandle, preview: { kind: 'loading' } })))).toBe(true);
    expect(isDisabled(submitButton(confirmHtml({ confirmHandle, preview: { kind: 'error' } })))).toBe(true);
    expect(isDisabled(submitButton(confirmHtml({ confirmHandle, preview: { kind: 'ready', counts } })))).toBe(false);
  });

  it('件数の読み込みに失敗したときだけ、再読み込みのボタンを出す', () => {
    const failed = confirmHtml({ preview: { kind: 'error' } });

    expect(failed).toContain('再読み込み');
    expect(isDisabled(buttonLabeled(failed, '再読み込み'))).toBe(false);
    expect(isDisabled(buttonLabeled(confirmHtml({ preview: { kind: 'error' }, submitting: true }), '再読み込み')))
      .toBe(true);
    expect(confirmHtml({ preview: { kind: 'loading' } })).not.toContain('再読み込み');
    expect(confirmHtml({})).not.toContain('再読み込み');
  });

  it('送信中は、ハンドルが一致していても両方のボタンを無効にする', () => {
    const html = confirmHtml({ confirmHandle: 'new.bsky.social', submitting: true });

    expect(isDisabled(submitButton(html))).toBe(true);
    expect(isDisabled(cancelButton(html))).toBe(true);
    expect(isDisabled(cancelButton(confirmHtml({})))).toBe(false);
    expect(confirmHtml({})).toContain('やめる');
  });

  it('エラーがあるときだけ出す', () => {
    expect(confirmHtml({ error: 'iori のパスワードが違います。' })).toContain('iori のパスワードが違います。');
    expect(confirmHtml({})).not.toContain('role="alert"');
  });
});

describe('AccountSwitchStatusView', () => {
  const purging: BlueskyAccountSwitchState = {
    state: 'purging',
    fromDid: 'did:plc:old',
    toDid: 'did:plc:new',
    startedAt: '2026-11-13T00:00:00.000Z',
    attempts: 3,
    lastError: null,
    stalled: false,
  };

  const statusViewHtml = (state: BlueskyAccountSwitchState | undefined, finished = false) =>
    String(jsx(AccountSwitchStatusView, { state, finished }));

  it('purging のあいだ、切り替え中と試行回数を出す', () => {
    const html = statusViewHtml(purging);

    expect(html).toContain('切り替え中です。前のアカウントのデータを消しています。');
    expect(html).toContain('3 回');
    expect(html).not.toContain('切り替えが止まっています。');
    expect(html).not.toContain('切り替えが終わりました。');
  });

  it('lastError があるときだけ出す', () => {
    expect(statusViewHtml({ ...purging, lastError: 'D1 timeout' })).toContain('D1 timeout');
    expect(statusViewHtml(purging)).not.toContain('D1 timeout');
  });

  it('stalled のときだけ、止まっていると出す', () => {
    expect(statusViewHtml({ ...purging, stalled: true })).toContain('切り替えが止まっています。');
    expect(statusViewHtml({ ...purging, stalled: false })).not.toContain('切り替えが止まっています。');
  });

  it('idle に戻ったときだけ、終わったと出す', () => {
    expect(statusViewHtml({ state: 'idle' }, true)).toContain('切り替えが終わりました。');
    expect(statusViewHtml({ state: 'idle' }, false)).toBe('');
    expect(statusViewHtml(undefined, false)).toBe('');
    expect(statusViewHtml(purging, true)).not.toContain('切り替えが終わりました。');
  });
});
