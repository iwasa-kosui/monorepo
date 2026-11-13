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
  replyVisibility: 'public',
  replyParentVisibility: undefined,
  isSendingReply: false,
  openReplyDialog: noop,
  closeReplyDialog: noop,
  setReplyContent: noop,
  setReplyDestination: noop,
  setReplyVisibility: noop,
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

  it('公開範囲の欄を出す', () => {
    const html = render({ replyingToPostId: 'post-1' });

    expect(html).toContain('aria-label="公開範囲"');
    expect(html).toContain('name="reply-visibility"');
  });

  it('返信先が未収載なら、公開の選択肢を無効にする', () => {
    const html = render({ replyingToPostId: 'post-1', replyParentVisibility: 'unlisted', replyVisibility: 'unlisted' });
    const disabled = [...html.matchAll(/<input[^>]*name="reply-visibility"[^>]*value="(\w+)"[^>]*disabled=""/g)].map((
      match,
    ) => match[1]);

    expect(disabled).toEqual(['public']);
  });

  it('返信先がダイレクトなら、選択欄の代わりに、返信もダイレクトになる文を出す', () => {
    const html = render({
      replyingToPostId: 'post-1',
      replyParentVisibility: 'direct',
      replyVisibility: 'private',
      replyDestination: 'fediverse',
    });

    expect(html).toContain('返信先がダイレクトなので、返信もダイレクトになります');
    expect(html).not.toContain('name="reply-visibility"');
  });

  it('返信先がダイレクトで送り先が both なら、Bluesky には送らない旨を同じ文に含め、別の案内は出さない', () => {
    const html = render({
      replyingToPostId: 'post-1',
      replyParentVisibility: 'direct',
      replyVisibility: 'private',
      replyDestination: 'both',
    });

    expect(html).toContain('返信先がダイレクトなので、返信もダイレクトになり、Bluesky には送りません');
    expect(html).not.toContain('公開範囲が公開ではないので、Bluesky には送りません');
  });

  it('返信先がダイレクトで送り先が fediverse なら、返信もダイレクトになる文だけを出す', () => {
    const html = render({
      replyingToPostId: 'post-1',
      replyParentVisibility: 'direct',
      replyVisibility: 'private',
      replyDestination: 'fediverse',
    });

    expect(html).toContain('返信先がダイレクトなので、返信もダイレクトになります');
    expect(html).not.toContain('Bluesky には送りません');
  });

  it('送り先が both で公開範囲が公開ではないとき、Bluesky に送らない案内を出す', () => {
    const html = render({ replyingToPostId: 'post-1', replyDestination: 'both', replyVisibility: 'unlisted' });

    expect(html).toContain('公開範囲が公開ではないので、Bluesky には送りません');
  });

  it('送り先が both でも公開範囲が公開なら、Bluesky に送らない案内を出さない', () => {
    const html = render({ replyingToPostId: 'post-1', replyDestination: 'both', replyVisibility: 'public' });

    expect(html).not.toContain('Bluesky には送りません');
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
