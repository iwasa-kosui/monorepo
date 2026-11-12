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

  describe('編集', () => {
    const base = { status: local, onEdit: () => {}, isLoggedIn: true, currentAccountId: 'actor-1' };

    it('自分のローカルの投稿で onEdit があれば、「編集」を action として出す', () => {
      const edit = menuItems(base).find((item) => item.key === 'edit');

      expect(edit).toMatchObject({ label: '編集', kind: 'action' });
      expect(edit).not.toHaveProperty('danger');
    });

    it('選ぶと、投稿を渡して onEdit を呼ぶ', () => {
      const onEdit = vi.fn();
      const edit = menuItems({ ...base, onEdit }).find((item) => item.key === 'edit');

      if (edit?.kind !== 'action') throw new Error('edit not found');
      void edit.onSelect();

      expect(onEdit).toHaveBeenCalledTimes(1);
      expect(onEdit).toHaveBeenCalledWith(local);
    });

    it('リポストは中身の自分の投稿を編集の対象にする', () => {
      const onEdit = vi.fn();
      const boost = { ...remote, id: 'boost-1', account: { ...remote.account, id: 'actor-9' }, reblog: local };
      const edit = menuItems({ ...base, status: boost, onEdit }).find((item) => item.key === 'edit');

      if (edit?.kind !== 'action') throw new Error('edit not found');
      void edit.onSelect();

      expect(onEdit).toHaveBeenCalledWith(local);
    });

    it('他人のローカルの投稿には出さない', () => {
      expect(keys({ ...base, currentAccountId: 'viewer' })).not.toContain('edit');
    });

    it('リモートの投稿には、投稿者の ID が自分と同じでも出さない', () => {
      expect(keys({ ...base, status: remote })).not.toContain('edit');
    });

    it('currentAccountId が無いときは出さない', () => {
      expect(keys({ ...base, currentAccountId: undefined })).not.toContain('edit');
    });

    it('onEdit が無いときは出さない', () => {
      expect(keys({ ...base, onEdit: undefined })).not.toContain('edit');
    });
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

  describe('ブックマーク', () => {
    it('未ブックマークで onBookmark があるなら「ブックマーク」を「リンクをコピー」の直前に出す', () => {
      const onBookmark = vi.fn();
      const items = menuItems({ status: { ...remote, bookmarked: false }, onBookmark, onUndoBookmark: () => {} });

      expect(items.map((item) => item.key)).toEqual(['open-original', 'bookmark', 'copy-link']);
      const item = items.find((candidate) => candidate.key === 'bookmark');
      if (item?.kind !== 'action') throw new Error('bookmark not found');
      expect(item.label).toBe('ブックマーク');
      void item.onSelect();
      expect(onBookmark).toHaveBeenCalledExactlyOnceWith('post-1');
    });

    it('ブックマーク済みで onUndoBookmark があるなら「ブックマークを外す」に切り替える', () => {
      const onUndoBookmark = vi.fn();
      const items = menuItems({ status: { ...remote, bookmarked: true }, onBookmark: () => {}, onUndoBookmark });

      expect(items.map((item) => item.key)).toEqual(['open-original', 'unbookmark', 'copy-link']);
      const item = items.find((candidate) => candidate.key === 'unbookmark');
      if (item?.kind !== 'action') throw new Error('unbookmark not found');
      expect(item.label).toBe('ブックマークを外す');
      void item.onSelect();
      expect(onUndoBookmark).toHaveBeenCalledExactlyOnceWith('post-1');
    });

    it('リポストは中身の投稿のブックマーク状態と ID を使う', () => {
      const onUndoBookmark = vi.fn();
      const boost = {
        ...local,
        id: 'boost-1',
        bookmarked: false,
        account: { ...local.account, id: 'actor-9' },
        reblog: { ...remote, bookmarked: true },
      };

      const item = menuItems({ status: boost, onUndoBookmark }).find((candidate) => candidate.key === 'unbookmark');

      if (item?.kind !== 'action') throw new Error('unbookmark not found');
      void item.onSelect();
      expect(onUndoBookmark).toHaveBeenCalledExactlyOnceWith('post-1');
    });

    it('状態に合うハンドラが渡されないときは出さない', () => {
      expect(keys({ status: { ...remote, bookmarked: false }, onUndoBookmark: () => {} })).not.toContain('bookmark');
      expect(keys({ status: { ...remote, bookmarked: true }, onBookmark: () => {} })).not.toContain('unbookmark');
      expect(keys({ status: remote })).toEqual(['open-original', 'copy-link']);
    });
  });

  describe('ブロック', () => {
    const base = { status: remote, onBlock: () => {}, isLoggedIn: true, currentAccountId: 'viewer' };
    const boost = { ...local, id: 'boost-1', account: { ...local.account, id: 'actor-9' }, reblog: remote };

    it('onBlock があり、ログイン済みでリモートの他人の投稿なら、danger の action として出す', () => {
      const block = menuItems(base).find((item) => item.key === 'block');

      expect(block).toMatchObject({ label: '@alice@remote.example をブロック', kind: 'action', danger: true });
    });

    it('選ぶと、投稿者のアカウント ID と acct を渡して onBlock を呼ぶ', () => {
      const onBlock = vi.fn();
      const block = menuItems({ ...base, onBlock }).find((item) => item.key === 'block');

      if (block?.kind !== 'action') throw new Error('block not found');
      void block.onSelect();

      expect(onBlock).toHaveBeenCalledTimes(1);
      expect(onBlock).toHaveBeenCalledWith('actor-1', 'alice@remote.example');
    });

    it('リポストは中身の投稿者をブロックの対象にする', () => {
      const onBlock = vi.fn();
      const block = menuItems({ ...base, status: boost, onBlock }).find((item) => item.key === 'block');

      if (block?.kind !== 'action') throw new Error('block not found');
      void block.onSelect();

      expect(onBlock).toHaveBeenCalledWith('actor-1', 'alice@remote.example');
    });

    it('ローカルの投稿者には出さない', () => {
      expect(keys({ ...base, status: local })).not.toContain('block');
    });

    it('自分の投稿には出さない', () => {
      expect(keys({ ...base, currentAccountId: 'actor-1' })).not.toContain('block');
    });

    it('未ログインでは出さない', () => {
      expect(keys({ ...base, isLoggedIn: false })).not.toContain('block');
      expect(keys({ ...base, isLoggedIn: undefined })).not.toContain('block');
    });

    it('onBlock が無いときは出さない', () => {
      expect(keys({ ...base, onBlock: undefined })).not.toContain('block');
    });
  });

  describe('通報', () => {
    const base = { status: remote, onReport: () => {}, isLoggedIn: true, currentAccountId: 'viewer' };
    const boost = { ...local, id: 'boost-1', account: { ...local.account, id: 'actor-9' }, reblog: remote };

    it('onReport があり、ログイン済みでリモートの他人の投稿なら、danger の action として出す', () => {
      const report = menuItems(base).find((item) => item.key === 'report');

      expect(report).toMatchObject({ label: 'この投稿を通報', kind: 'action', danger: true });
    });

    it('選ぶと、投稿者のアカウント ID、acct、投稿 ID を渡して onReport を呼ぶ', () => {
      const onReport = vi.fn();
      const report = menuItems({ ...base, onReport }).find((item) => item.key === 'report');

      if (report?.kind !== 'action') throw new Error('report not found');
      void report.onSelect();

      expect(onReport).toHaveBeenCalledTimes(1);
      expect(onReport).toHaveBeenCalledWith({
        accountId: 'actor-1',
        acct: 'alice@remote.example',
        statusId: remote.id,
      });
    });

    it('リポストは中身の投稿者と中身の投稿 ID を通報の対象にする', () => {
      const onReport = vi.fn();
      const report = menuItems({ ...base, status: boost, onReport }).find((item) => item.key === 'report');

      if (report?.kind !== 'action') throw new Error('report not found');
      void report.onSelect();

      expect(onReport).toHaveBeenCalledWith({
        accountId: 'actor-1',
        acct: 'alice@remote.example',
        statusId: remote.id,
      });
      expect(remote.id).not.toBe(boost.id);
    });

    it('ローカルの投稿者には出さない', () => {
      expect(keys({ ...base, status: local })).not.toContain('report');
    });

    it('自分の投稿には出さない', () => {
      expect(keys({ ...base, currentAccountId: 'actor-1' })).not.toContain('report');
    });

    it('未ログインでは出さない', () => {
      expect(keys({ ...base, isLoggedIn: false })).not.toContain('report');
      expect(keys({ ...base, isLoggedIn: undefined })).not.toContain('report');
    });

    it('onReport が無いときは出さない', () => {
      expect(keys({ ...base, onReport: undefined })).not.toContain('report');
    });
  });

  it('ミュート、ブロック、通報の順に並べる', () => {
    expect(
      keys({
        status: remote,
        onMute: () => {},
        onBlock: () => {},
        onReport: () => {},
        isLoggedIn: true,
        currentAccountId: 'viewer',
      }),
    ).toEqual(['open-original', 'copy-link', 'mute', 'block', 'report']);
  });

  describe('引用', () => {
    const base = { status: { ...remote, visibility: 'public' as const }, onQuote: () => {} };

    it('public の投稿では、先頭に action として出す', () => {
      expect(menuItems(base)[0]).toMatchObject({ key: 'quote', label: '引用', kind: 'action' });
    });

    it('unlisted の投稿でも出す', () => {
      expect(keys({ ...base, status: { ...remote, visibility: 'unlisted' } })).toContain('quote');
    });

    it('private と direct の投稿には出さない', () => {
      expect(keys({ ...base, status: { ...remote, visibility: 'private' } })).not.toContain('quote');
      expect(keys({ ...base, status: { ...remote, visibility: 'direct' } })).not.toContain('quote');
    });

    it('onQuote が無いときは出さない', () => {
      expect(keys({ ...base, onQuote: undefined })).not.toContain('quote');
    });

    it('選ぶと、表示している投稿を渡して onQuote を呼ぶ', () => {
      const onQuote = vi.fn();
      const quote = menuItems({ ...base, onQuote }).find((item) => item.key === 'quote');

      if (quote?.kind !== 'action') throw new Error('quote not found');
      void quote.onSelect();

      expect(onQuote).toHaveBeenCalledTimes(1);
      expect(onQuote).toHaveBeenCalledWith(base.status);
    });

    it('リポストは中身の投稿を引用の対象にし、可視性も中身で判定する', () => {
      const onQuote = vi.fn();
      const inner = { ...remote, visibility: 'public' as const };
      const boost = { ...local, id: 'boost-1', visibility: 'private' as const, reblog: inner };
      const quote = menuItems({ status: boost, onQuote }).find((item) => item.key === 'quote');

      if (quote?.kind !== 'action') throw new Error('quote not found');
      void quote.onSelect();

      expect(onQuote).toHaveBeenCalledWith(inner);
    });
  });
});
