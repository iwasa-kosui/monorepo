import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { UseReplyDialogReturn } from '../hooks/useReplyDialog.ts';
import { FediverseReplyModal, shouldCloseReplyModalOnKey } from './FediverseReplyModal.tsx';
import { DEFAULT_POST_DESTINATION } from './postDestination.ts';

const noop = () => {};

const dialog = (overrides: Partial<UseReplyDialogReturn> = {}): UseReplyDialogReturn => ({
  replyingToPostId: null,
  replyingToUsername: null,
  replyContent: '',
  replyDestination: DEFAULT_POST_DESTINATION,
  isSendingReply: false,
  openReplyDialog: noop,
  closeReplyDialog: noop,
  setReplyContent: noop,
  setReplyDestination: noop,
  sendReply: () => Promise.resolve(true),
  ...overrides,
});

const render = (overrides: Partial<UseReplyDialogReturn> = {}): string =>
  String(jsx(FediverseReplyModal, { dialog: dialog(overrides) }));

describe('FediverseReplyModal', () => {
  it('返信先がなければ何も描画しない', () => {
    expect(render()).toBe('');
  });

  it('返信先があれば返信のダイアログを描画する', () => {
    const html = render({ replyingToPostId: 'post-1' });

    expect(html).toContain('返信する');
    expect(html).toContain('キャンセル');
  });

  it('返信先のユーザー名があれば、見出しを「@ユーザー名 に返信」にする', () => {
    const html = render({ replyingToPostId: 'post-1', replyingToUsername: 'alice' });

    expect(html).toContain('>@alice に返信</h2>');
  });

  it('返信先のユーザー名がなければ、見出しを「返信」にする', () => {
    const html = render({ replyingToPostId: 'post-1' });

    expect(html).toContain('>返信</h2>');
  });

  it('Markdown とプレビューのタブを出す', () => {
    const html = render({ replyingToPostId: 'post-1' });

    expect(html).toContain('>Markdown</button>');
    expect(html).toContain('>Preview</button>');
  });

  it('本文が空なら送信できない', () => {
    expect(render({ replyingToPostId: 'post-1', replyContent: '  ' })).toContain('disabled');
  });

  it('送信中は「送信中...」を出す', () => {
    expect(render({ replyingToPostId: 'post-1', replyContent: 'hi', isSendingReply: true })).toContain('送信中...');
  });
});

describe('shouldCloseReplyModalOnKey', () => {
  it('Escape で、送信中でなければ閉じる', () => {
    expect(shouldCloseReplyModalOnKey('Escape', false)).toBe(true);
  });

  it('Escape でも、送信中は閉じない', () => {
    expect(shouldCloseReplyModalOnKey('Escape', true)).toBe(false);
  });

  it('Escape 以外のキーでは閉じない', () => {
    expect(shouldCloseReplyModalOnKey('Enter', false)).toBe(false);
  });
});
