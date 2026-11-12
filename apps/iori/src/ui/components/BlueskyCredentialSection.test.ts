import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { BlueskyCredentialStatus } from '../api/blueskyCredentialClient.ts';
import { BlueskyCredentialStatusView, CredentialFormView } from './BlueskyCredentialSection.tsx';

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
