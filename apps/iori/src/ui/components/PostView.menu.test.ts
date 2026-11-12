import { describe, expect, it, vi } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { PostMenu, type PostMenuItem } from './PostMenu.tsx';
import { PostView } from './PostView.tsx';

const source = {
  postId: 'post-1',
  actorId: 'actor-1',
  userId: 'user-1',
  username: 'alice',
  content: '<p>本文です</p>',
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
};

const remote = postToStatus({
  ...source,
  type: 'remote',
  uri: 'https://remote.example/notes/1',
} as unknown as PostWithAuthor);
const local = postToStatus({ ...source, type: 'local' } as unknown as PostWithAuthor);

const apiUri = 'https://iori.example/api/v1/statuses/post-1';

const findMenu = (node: unknown): { items: readonly PostMenuItem[] } | undefined => {
  if (Array.isArray(node)) return node.map(findMenu).find((found) => found !== undefined);
  if (typeof node !== 'object' || node === null || !('tag' in node)) return undefined;
  const { tag, props, children } = node as { tag: unknown; props: Record<string, unknown>; children: unknown };
  if (tag === PostMenu) return props as { items: readonly PostMenuItem[] };
  if (typeof tag === 'function') return findMenu(tag({ ...props, children }));
  return findMenu(children);
};

const menuItems = (props: Partial<Parameters<typeof PostView>[0]> & { status: Status }): readonly PostMenuItem[] =>
  findMenu(PostView(props))?.items ?? [];

const keys = (props: Partial<Parameters<typeof PostView>[0]> & { status: Status }): readonly string[] =>
  menuItems(props).map((item) => item.key);

describe('PostView の「…」メニュー', () => {
  it('リモートの投稿では「元の投稿を開く」と「リンクをコピー」を出す', () => {
    expect(menuItems({ status: remote })).toEqual([
      { key: 'open-original', label: '元の投稿を開く', kind: 'link', href: 'https://remote.example/notes/1' },
      { key: 'copy-link', label: 'リンクをコピー', kind: 'copy', text: 'https://remote.example/notes/1' },
    ]);
  });

  it('ローカルの投稿では「元の投稿を開く」を出さず、「リンクをコピー」だけ出す', () => {
    expect(menuItems({ status: local })).toEqual([
      { key: 'copy-link', label: 'リンクをコピー', kind: 'copy', text: local.url },
    ]);
  });

  it('url が null で uri も使えないなら、リモートでもどちらも出さない', () => {
    expect(keys({ status: { ...remote, url: null, uri: apiUri } })).toEqual([]);
    expect(keys({ status: { ...local, url: null } })).toEqual([]);
  });

  it('リモートで url が null でも、uri が元サーバーの https の URL ならどちらも出す', () => {
    const origin = 'https://origin.example/notes/9';

    expect(menuItems({ status: { ...remote, url: null, uri: origin } })).toEqual([
      { key: 'open-original', label: '元の投稿を開く', kind: 'link', href: origin },
      { key: 'copy-link', label: 'リンクをコピー', kind: 'copy', text: origin },
    ]);
  });

  it('リモートで url が null のとき、uri が iori の API の URL なら出さない', () => {
    expect(keys({ status: { ...remote, url: null, uri: apiUri } })).toEqual([]);
  });

  it('リモートで url が null のとき、uri が https でなければ出さない', () => {
    expect(keys({ status: { ...remote, url: null, uri: 'http://origin.example/notes/9' } })).toEqual([]);
  });

  it('ローカルの投稿では url が null なら、uri が https でも出さない', () => {
    expect(keys({ status: { ...local, url: null, uri: 'https://origin.example/notes/9' } })).toEqual([]);
  });

  it('リポストは中身の投稿を対象にする', () => {
    const boost = { ...local, id: 'boost-1', account: { ...local.account, id: 'actor-9' }, reblog: remote };

    expect(menuItems({ status: boost }).map((item) => ('href' in item ? item.href : item.key))).toEqual([
      'https://remote.example/notes/1',
      'copy-link',
    ]);
  });

  describe('ミュート', () => {
    const base = { status: remote, onMute: () => {}, isLoggedIn: true, currentAccountId: 'viewer' };

    it('onMute があり、ログイン済みで他人の投稿なら、danger の action として出す', () => {
      const mute = menuItems(base).find((item) => item.key === 'mute');

      expect(mute).toMatchObject({ label: '@alice@remote.example をミュート', kind: 'action', danger: true });
    });

    it('選ぶと、投稿者のアカウント ID と acct を渡して onMute を呼ぶ', () => {
      const onMute = vi.fn();
      const mute = menuItems({ ...base, onMute }).find((item) => item.kind === 'action');

      if (mute?.kind !== 'action') throw new Error('mute not found');
      void mute.onSelect();

      expect(onMute).toHaveBeenCalledTimes(1);
      expect(onMute).toHaveBeenCalledWith('actor-1', 'alice@remote.example');
    });

    it('リポストは中身の投稿者をミュートの対象にする', () => {
      const onMute = vi.fn();
      const boost = { ...local, id: 'boost-1', account: { ...local.account, id: 'actor-9' }, reblog: remote };
      const mute = menuItems({ ...base, status: boost, onMute }).find((item) => item.kind === 'action');

      if (mute?.kind !== 'action') throw new Error('mute not found');
      void mute.onSelect();

      expect(onMute).toHaveBeenCalledTimes(1);
      expect(onMute).toHaveBeenCalledWith('actor-1', 'alice@remote.example');
    });

    it('自分の投稿には出さない', () => {
      expect(keys({ ...base, currentAccountId: 'actor-1' })).not.toContain('mute');
    });

    it('未ログインでは出さない', () => {
      expect(keys({ ...base, isLoggedIn: false })).not.toContain('mute');
      expect(keys({ ...base, isLoggedIn: undefined })).not.toContain('mute');
    });

    it('currentAccountId が無いときは出さない', () => {
      expect(keys({ ...base, currentAccountId: undefined })).not.toContain('mute');
    });

    it('onMute が無いときは出さない', () => {
      expect(keys({ ...base, onMute: undefined })).not.toContain('mute');
    });

    it('url が null でもミュートだけは出す', () => {
      expect(keys({ ...base, status: { ...remote, url: null, uri: apiUri } })).toEqual(['mute']);
    });
  });
});
