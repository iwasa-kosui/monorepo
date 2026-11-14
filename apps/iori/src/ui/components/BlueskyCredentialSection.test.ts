import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { BlueskyDidMismatch } from '../api/blueskyCredentialClient.ts';
import { AccountSwitchConfirmView } from './BlueskyCredentialSection.tsx';

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
  const isDisabled = (tag: string) => /\sdisabled(?:=|\s|>)/.test(tag);

  it('件数の読み込み中と失敗のあいだは、ハンドルが一致していても送信ボタンを無効にする', () => {
    const confirmHandle = 'new.bsky.social';

    expect(isDisabled(submitButton(confirmHtml({ confirmHandle, preview: { kind: 'loading' } })))).toBe(true);
    expect(isDisabled(submitButton(confirmHtml({ confirmHandle, preview: { kind: 'error' } })))).toBe(true);
    expect(isDisabled(submitButton(confirmHtml({ confirmHandle, preview: { kind: 'ready', counts } })))).toBe(false);
  });
});
