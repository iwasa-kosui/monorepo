import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { UseReplyDialogReturn } from '../hooks/useReplyDialog.ts';
import { postToStatus } from '../legacyConversion.ts';
import { FediverseReplyModal, shouldCloseReplyModalOnKey } from './FediverseReplyModal.tsx';
import { DEFAULT_POST_DESTINATION } from './postDestination.ts';

const noop = () => {};

const dialog = (overrides: Partial<UseReplyDialogReturn> = {}): UseReplyDialogReturn => ({
  replyingToPostId: null,
  replyingToUsername: null,
  replyingToStatus: null,
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

const parent = (overrides: Partial<PostWithAuthor> = {}) =>
  postToStatus({
    postId: 'post-1',
    actorId: 'actor-1',
    userId: 'user-1',
    username: 'mzp',
    content: '<p>アメリカに閉じこめられた?!</p>',
    createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
    logoUri: undefined,
    liked: false,
    reposted: false,
    inReplyToUri: null,
    summary: null,
    sensitive: false,
    images: [],
    likeCount: 0,
    repostCount: 0,
    reactions: [],
    linkPreviews: [],
    type: 'remote',
    uri: 'https://remote.example/notes/1',
    ...overrides,
  } as unknown as PostWithAuthor);

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

  it('プレビューの切り替えボタンを出す', () => {
    const html = render({ replyingToPostId: 'post-1' });

    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>プレビュー<\/button>/);
  });

  it('公開範囲と送り先のセレクトを、キャンセルと返信するのボタンと同じ行に出す', () => {
    const html = render({ replyingToPostId: 'post-1' });
    const footer = html.slice(html.indexOf('mr-auto flex flex-wrap'));

    expect(footer).toContain('aria-label="公開範囲"');
    expect(footer).toContain('aria-label="送り先"');
    expect(footer).toContain('キャンセル');
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
    const select = /<select[^>]*name="reply-visibility"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
    const disabled = [...select.matchAll(/<option value="(\w+)" disabled="">/g)].map((match) => match[1]);

    expect(disabled).toEqual(['public']);
  });

  it.each(['both', 'fediverse'] as const)(
    '返信先がダイレクトなら、送り先が %s でも、公開範囲のセレクトの代わりにダイレクトの印だけを出し、説明の文は出さない',
    (replyDestination) => {
      const html = render({
        replyingToPostId: 'post-1',
        replyParentVisibility: 'direct',
        replyVisibility: 'private',
        replyDestination,
      });

      expect(html).toContain('ダイレクト');
      expect(html).not.toContain('name="reply-visibility"');
      expect(html).not.toContain('返信先がダイレクトなので');
      expect(html).not.toContain('Bluesky には送りません');
    },
  );

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

  it('返信先の投稿があれば、本文を入力欄の上に出す', () => {
    const html = render({ replyingToPostId: 'post-1', replyingToStatus: parent() });

    expect(html).toContain('aria-label="返信先の投稿"');
    expect(html).toContain('アメリカに閉じこめられた?!');
    expect(html.indexOf('aria-label="返信先の投稿"')).toBeLessThan(html.indexOf('<textarea'));
  });

  it('返信先の投稿に CW があれば、本文の代わりに CW の文を出す', () => {
    const html = render({
      replyingToPostId: 'post-1',
      replyingToStatus: parent({ summary: 'ネタバレ' } as Partial<PostWithAuthor>),
    });

    expect(html).toContain('ネタバレ');
    expect(html).not.toContain('アメリカに閉じこめられた?!');
  });

  it('返信先の投稿はリンクにせず、書いている途中で移動しないようにする', () => {
    const html = render({ replyingToPostId: 'post-1', replyingToStatus: parent() });
    const card = html.slice(html.indexOf('aria-label="返信先の投稿"'), html.indexOf('<textarea'));

    expect(card).not.toContain('<a ');
  });

  it('公開範囲が公開でなくても、Bluesky に送らない旨の文は出さない', () => {
    const html = render({ replyingToPostId: 'post-1', replyVisibility: 'unlisted', replyDestination: 'both' });

    expect(html).not.toContain('Bluesky には送りません');
  });
});
