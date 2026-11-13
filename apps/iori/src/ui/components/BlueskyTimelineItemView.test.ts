import { jsx } from 'hono/jsx';
import { describe, expect, it, vi } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { BlueskyTimelineItemView } from './BlueskyTimelineItemView.tsx';
import { PostMenu, type PostMenuItem } from './PostMenu.tsx';

const base: IoriBlueskyTimelineItemBody = {
  feedItemId: 'at://did:plc:author/app.bsky.feed.post/3kabc',
  uri: 'at://did:plc:author/app.bsky.feed.post/3kabc',
  cid: 'cid',
  authorDid: 'did:plc:author',
  authorHandle: 'alice.bsky.social',
  authorDisplayName: 'Alice',
  authorAvatar: 'https://cdn.example/avatar.jpg',
  text: '本文です',
  facets: [],
  embed: null,
  replyParentUri: null,
  replyParentAuthorHandle: null,
  repostedByDid: null,
  repostedByHandle: null,
  bridgyOriginalUrl: null,
  bridgedFromPostId: null,
  postedAt: Date.UTC(2026, 10, 8, 1),
  indexedAt: Date.UTC(2026, 10, 8, 1),
  liked: false,
  reposted: false,
  bookmarked: false,
  threadMuted: false,
  replyRootUri: null,
  isOwn: false,
};
const render = (
  item: Partial<IoriBlueskyTimelineItemBody>,
  props: Partial<Parameters<typeof BlueskyTimelineItemView>[0]> = {},
): string => String(jsx(BlueskyTimelineItemView, { item: { ...base, ...item }, ...props }));

type ClickableNode = Readonly<{ props: { onClick: (event: { stopPropagation: () => void }) => void } }>;

const findMenuItems = (node: unknown): readonly PostMenuItem[] | undefined => {
  if (Array.isArray(node)) return node.map(findMenuItems).find((found) => found);
  if (typeof node !== 'object' || node === null || !('tag' in node)) return undefined;
  const { tag, props, children } = node as { tag: unknown; props: Record<string, unknown>; children: unknown };
  if (tag === PostMenu) return props.items as readonly PostMenuItem[];
  if (typeof tag === 'function') return findMenuItems(tag({ ...props, children }));
  return findMenuItems(children);
};

const menuSummary = (entry: PostMenuItem) => ({
  key: entry.key,
  label: entry.label,
  danger: entry.kind === 'action' ? entry.danger : undefined,
});

const findButtonByTitle = (node: unknown, title: string): ClickableNode | undefined => {
  if (Array.isArray(node)) return node.map((child) => findButtonByTitle(child, title)).find((found) => found);
  if (typeof node !== 'object' || node === null || !('tag' in node)) return undefined;
  const { tag, props, children } = node as { tag: unknown; props: Record<string, unknown>; children: unknown };
  if (tag === 'button' && props.title === title) return node as unknown as ClickableNode;
  if (typeof tag === 'function') return findButtonByTitle(tag({ ...props, children }), title);
  return findButtonByTitle(children, title);
};

describe('BlueskyTimelineItemView', () => {
  it('投稿者の表示名と @handle、本文、iori 内の投稿の詳細へのリンクを出す', () => {
    const html = render({});

    expect(html).toContain('Alice');
    expect(html).toContain('@alice.bsky.social');
    expect(html).toContain('本文です');
    expect(html).toContain('href="/bluesky/profile/did:plc:author/post/3kabc"');
    expect(html).toContain('src="https://cdn.example/avatar.jpg"');
  });

  it('時刻のリンクは同じタブで開く', () => {
    const html = render({});

    expect(html).not.toContain('bsky.app');
    expect(html).not.toMatch(/<a href="\/bluesky\/[^>]*target=/);
  });

  it('投稿者のアイコン・表示名・@handle を、DID を使った iori のプロフィール画面へのリンクにする（同じタブ）', () => {
    const html = render({});

    expect(html.match(/href="\/bluesky\/profile\/did%3Aplc%3Aauthor"/g)).toHaveLength(2);
    expect(html).not.toContain('href="/bluesky/profile/did%3Aplc%3Aauthor" target');
  });

  it('リポストした人の名前を、その人のプロフィール画面へのリンクにする', () => {
    const html = render({ repostedByDid: 'did:plc:bob', repostedByHandle: 'bob.bsky.social' });

    expect(html).toContain('<a href="/bluesky/profile/did%3Aplc%3Abob" class="hover:underline">@bob.bsky.social</a>');
    expect(html).toContain('がリポスト');
  });

  it('本文の mention は同じタブで iori のプロフィール画面を開き、外部リンクは別タブで開く', () => {
    const text = '@bob https://example.com';
    const urlStart = new TextEncoder().encode('@bob ').length;
    const html = render({
      text,
      facets: [
        { byteStart: 0, byteEnd: 4, feature: { type: 'mention', did: 'did:plc:bob' } },
        { byteStart: urlStart, byteEnd: urlStart + 19, feature: { type: 'link', uri: 'https://example.com' } },
      ],
    });

    expect(html).toContain('<a href="/bluesky/profile/did%3Aplc%3Abob" class="');
    expect(html).not.toContain('<a href="/bluesky/profile/did%3Aplc%3Abob" target');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer"');
  });

  it('本文を HTML として挿入せず、facet のリンクは rel と target つきの a 要素にする', () => {
    const text = '<img src=x onerror=alert(1)> https://example.com';
    const start = new TextEncoder().encode('<img src=x onerror=alert(1)> ').length;
    const html = render({
      text,
      facets: [{ byteStart: start, byteEnd: start + 19, feature: { type: 'link', uri: 'https://example.com' } }],
    });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer"');
  });

  it('http/https 以外の link はリンクにしない', () => {
    const html = render({
      text: 'click',
      facets: [{ byteStart: 0, byteEnd: 5, feature: { type: 'link', uri: 'javascript:alert(1)' } }],
    });

    expect(html).not.toContain('javascript:');
    expect(html).toContain('click');
  });

  it('リポストと返信の表示を出す', () => {
    const html = render({
      repostedByHandle: 'bob.bsky.social',
      replyParentUri: 'at://did:plc:p/app.bsky.feed.post/1',
      replyParentAuthorHandle: 'carol.bsky.social',
    });

    expect(html).toContain('@bob.bsky.social がリポスト');
    expect(html).toContain('@carol.bsky.social への返信');
  });

  it('画像は thumb を表示し fullsize にリンクし、alt を付ける', () => {
    const html = render({
      embed: {
        type: 'images',
        images: [{ thumb: 'https://cdn.example/t.jpg', fullsize: 'https://cdn.example/f.jpg', alt: '猫の写真' }],
      },
    });

    expect(html).toContain('href="https://cdn.example/f.jpg"');
    expect(html).toContain('src="https://cdn.example/t.jpg"');
    expect(html).toContain('alt="猫の写真"');
  });

  it('http/https 以外の画像・リンクカードの URL は出さない', () => {
    const images = render({
      embed: { type: 'images', images: [{ thumb: 'javascript:alert(1)', fullsize: 'javascript:alert(2)', alt: '' }] },
    });
    const card = render({
      embed: { type: 'external', uri: 'javascript:alert(3)', title: 't', description: 'd', thumb: null },
    });

    expect(images).not.toContain('javascript:');
    expect(card).not.toContain('javascript:');
  });

  it('リンクカードと引用を出す', () => {
    const html = render({
      embed: {
        type: 'recordWithMedia',
        media: { type: 'external', uri: 'https://example.com/a', title: '記事', description: '説明', thumb: null },
        record: {
          type: 'record',
          uri: 'at://did:plc:q/app.bsky.feed.post/3kq',
          authorHandle: 'q.bsky.social',
          text: '引用本文',
        },
      },
    });

    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('記事');
    expect(html).toContain('@q.bsky.social');
    expect(html).toContain('引用本文');
    expect(html).toMatch(/<a href="\/bluesky\/profile\/did:plc:q\/post\/3kq" class=/);
    expect(html).not.toContain('bsky.app');
  });

  describe('引用', () => {
    const quoteUri = 'at://did:plc:q/app.bsky.feed.post/3kq';
    const quoteHref = '/bluesky/profile/did:plc:q/post/3kq';
    const record = { type: 'record', uri: quoteUri, authorHandle: 'q.bsky.social', text: '引用本文' } as const;
    const nestedAnchor = /<a\b(?:(?!<\/a>)[\s\S])*<a\b/;

    it('投稿者のアバター・表示名・@handle・本文を出し、カードの本文を投稿の詳細へのリンクにする', () => {
      const html = render({
        embed: {
          ...record,
          authorDisplayName: '引用者',
          authorAvatar: 'https://cdn.example/q.jpg',
        },
      });

      expect(html).toContain('src="https://cdn.example/q.jpg"');
      expect(html).toContain('引用者');
      expect(html).toContain('@q.bsky.social');
      expect(html).toContain('引用本文');
      expect(html).toContain(`<a href="${quoteHref}"`);
    });

    it('引用先の画像を表示し、リンクを入れ子にしない', () => {
      const html = render({
        embed: {
          ...record,
          media: {
            type: 'images',
            images: [{ thumb: 'https://cdn.example/qt.jpg', fullsize: 'https://cdn.example/qf.jpg', alt: '引用の猫' }],
          },
        },
      });

      expect(html).toContain('src="https://cdn.example/qt.jpg"');
      expect(html).toContain('href="https://cdn.example/qf.jpg"');
      expect(html).toContain(`<a href="${quoteHref}"`);
      expect(html).not.toMatch(nestedAnchor);
    });

    it('本文が空で画像だけの引用先では、空の本文の段落を出さない', () => {
      const html = render({
        embed: {
          ...record,
          text: '',
          media: {
            type: 'images',
            images: [{ thumb: 'https://cdn.example/qt.jpg', fullsize: 'https://cdn.example/qf.jpg', alt: '' }],
          },
        },
      });

      expect(html).toContain('src="https://cdn.example/qt.jpg"');
      expect(html).not.toContain('<p class="text-sm whitespace-pre-wrap');
    });

    it('引用先のリンクカードと動画を表示し、リンクを入れ子にしない', () => {
      const card = render({
        embed: {
          ...record,
          media: { type: 'external', uri: 'https://example.com/q', title: '引用の記事', description: '', thumb: null },
        },
      });
      const video = render({
        embed: {
          ...record,
          media: {
            type: 'video',
            thumbnail: null,
            playlist: 'https://video.example/q.m3u8',
            aspectRatio: null,
            alt: null,
          },
        },
      });

      expect(card).toContain('href="https://example.com/q"');
      expect(card).not.toMatch(nestedAnchor);
      expect(video).toContain('aria-label="動画を再生"');
      expect(video).not.toMatch(nestedAnchor);
    });

    it('recordWithMedia の引用先のメディアも入れ子のリンクにしない', () => {
      const html = render({
        embed: {
          type: 'recordWithMedia',
          media: { type: 'external', uri: 'https://example.com/a', title: '記事', description: '', thumb: null },
          record: {
            ...record,
            media: {
              type: 'external',
              uri: 'https://example.com/q',
              title: '引用の記事',
              description: '',
              thumb: null,
            },
          },
        },
      });

      expect(html).toContain('href="https://example.com/a"');
      expect(html).toContain('href="https://example.com/q"');
      expect(html).not.toMatch(nestedAnchor);
    });

    it('新しい項目が無い旧形式の引用は、@handle と本文だけを出す', () => {
      const html = render({ embed: record });

      expect(html).toContain('@q.bsky.social');
      expect(html).toContain('引用本文');
      expect(html).toContain(`<a href="${quoteHref}"`);
      expect(html).not.toContain('<img src="https://cdn.example/q');
      expect(html).not.toMatch(nestedAnchor);
    });

    it('引用先の uri が投稿の at-uri として読めなければ、リンクにしない', () => {
      const html = render({ embed: { ...record, uri: 'nope' } });

      expect(html).toContain('引用本文');
      expect(html).not.toContain('href="/bluesky/profile/did:plc:q');
      expect(html).not.toContain('href="nope"');
    });

    it('引用先のアバターが http/https 以外なら出さない', () => {
      const html = render({ embed: { ...record, authorAvatar: 'javascript:alert(1)' } });

      expect(html).not.toContain('javascript:');
    });

    it.each(
      [
        ['notFound', '引用された投稿は削除されています'],
        ['blocked', 'ブロックにより引用された投稿を表示できません'],
        ['detached', '引用元の投稿者が引用を外しました'],
      ] as const,
    )('引用先が %s なら、リンクなしの枠に文言を出す', (reason, message) => {
      const html = render({ embed: { type: 'recordUnavailable', uri: quoteUri, reason } });

      expect(html).toContain(message);
      expect(html).not.toContain(quoteHref);
      expect(html.match(/<a /g)).toHaveLength(render({}).match(/<a /g)!.length);
    });

    it('recordWithMedia の引用先が読めないときも、media と文言を出す', () => {
      const html = render({
        embed: {
          type: 'recordWithMedia',
          media: { type: 'external', uri: 'https://example.com/a', title: '記事', description: '', thumb: null },
          record: { type: 'recordUnavailable', uri: quoteUri, reason: 'blocked' },
        },
      });

      expect(html).toContain('href="https://example.com/a"');
      expect(html).toContain('ブロックにより引用された投稿を表示できません');
    });
  });

  it('返信先の表示を、親の投稿の詳細へのリンクにする', () => {
    const html = render({
      replyParentUri: 'at://did:plc:p/app.bsky.feed.post/3kp',
      replyParentAuthorHandle: 'carol.bsky.social',
    });

    expect(html).toMatch(
      /<a href="\/bluesky\/profile\/did:plc:p\/post\/3kp" class="[^"]*">@carol.bsky.social への返信<\/a>/,
    );
  });

  it('返信先の uri が at-uri として読めなければ、リンクにしない', () => {
    const html = render({ replyParentUri: 'nope', replyParentAuthorHandle: null });

    expect(html).toContain('>返信</div>');
    expect(html).not.toMatch(/<a [^>]*>返信<\/a>/);
  });

  it('動画は、押すまで読み込まないサムネイルと再生ボタンにする（bsky.app へのリンクにしない）', () => {
    const html = render({
      embed: {
        type: 'video',
        thumbnail: 'https://video.example/thumb.jpg',
        playlist: 'https://video.example/playlist.m3u8',
        aspectRatio: { width: 9, height: 16 },
        alt: '走る猫',
      },
    });

    expect(html).toContain('aria-label="動画を再生: 走る猫"');
    expect(html).toContain('src="https://video.example/thumb.jpg"');
    expect(html).toContain('aspect-ratio: 9 / 16');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('bsky.app');
    expect(html).not.toContain('m3u8');
  });

  it('recordWithMedia の動画も再生ボタンにする', () => {
    const html = render({
      embed: {
        type: 'recordWithMedia',
        media: {
          type: 'video',
          thumbnail: null,
          playlist: 'https://video.example/playlist.m3u8',
          aspectRatio: null,
          alt: null,
        },
        record: {
          type: 'record',
          uri: 'at://did:plc:q/app.bsky.feed.post/3kq',
          authorHandle: 'q.bsky.social',
          text: '',
        },
      },
    });

    expect(html).toContain('aria-label="動画を再生"');
    expect(html).toContain('aspect-ratio: 16 / 9');
  });

  describe('「…」メニュー', () => {
    const url = 'https://bsky.app/profile/did:plc:author/post/3kabc';

    it('「Bluesky で開く」と「リンクをコピー」を、bsky.app の投稿の URL で出す', () => {
      expect(findMenuItems(BlueskyTimelineItemView({ item: base }))).toEqual([
        { key: 'open-bluesky', label: 'Bluesky で開く', kind: 'link', href: url },
        { key: 'copy-link', label: 'リンクをコピー', kind: 'copy', text: url },
      ]);
    });

    describe('ブックマーク', () => {
      it('ハンドラが無いときは出さない', () => {
        const items = findMenuItems(BlueskyTimelineItemView({ item: base })) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link']);
      });

      it('ブックマークしていない投稿には「ブックマーク」を出し、選ぶと onBookmark を item つきで呼ぶ', () => {
        const onBookmark = vi.fn();
        const onUndoBookmark = vi.fn();
        const items = findMenuItems(BlueskyTimelineItemView({ item: base, onBookmark, onUndoBookmark })) ?? [];

        expect(items.map(menuSummary)).toContainEqual({ key: 'bookmark', label: 'ブックマーク', danger: undefined });
        const entry = items.find((candidate) => candidate.key === 'bookmark');
        if (entry?.kind === 'action') void entry.onSelect();
        expect(onBookmark).toHaveBeenCalledExactlyOnceWith(base);
        expect(onUndoBookmark).not.toHaveBeenCalled();
      });

      it('ブックマーク済みの投稿には「ブックマークを外す」を出し、選ぶと onUndoBookmark を呼ぶ', () => {
        const onBookmark = vi.fn();
        const onUndoBookmark = vi.fn();
        const bookmarked = { ...base, bookmarked: true };
        const items = findMenuItems(BlueskyTimelineItemView({ item: bookmarked, onBookmark, onUndoBookmark })) ?? [];

        expect(items.map(menuSummary)).toContainEqual({
          key: 'bookmark',
          label: 'ブックマークを外す',
          danger: undefined,
        });
        expect(items.map((candidate) => candidate.label)).not.toContain('ブックマーク');
        const entry = items.find((candidate) => candidate.key === 'bookmark');
        if (entry?.kind === 'action') void entry.onSelect();
        expect(onUndoBookmark).toHaveBeenCalledExactlyOnceWith(bookmarked);
        expect(onBookmark).not.toHaveBeenCalled();
      });

      it('状態に合うハンドラが渡されないときは出さない', () => {
        const onlyBookmark = findMenuItems(
          BlueskyTimelineItemView({ item: { ...base, bookmarked: true }, onBookmark: vi.fn() }),
        ) ?? [];
        const onlyUndo = findMenuItems(BlueskyTimelineItemView({ item: base, onUndoBookmark: vi.fn() })) ?? [];

        expect(onlyBookmark.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link']);
        expect(onlyUndo.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link']);
      });

      it('自分の投稿にも出す', () => {
        const items = findMenuItems(
          BlueskyTimelineItemView({ item: { ...base, isOwn: true }, onBookmark: vi.fn() }),
        ) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link', 'bookmark']);
      });
    });

    describe('スレッドのミュート', () => {
      const threadHandlers = () => ({ onMuteThread: vi.fn(), onUnmuteThread: vi.fn() });

      it('ミュートしていなければ、作者のミュートの前に「スレッドをミュート」を danger なしで出す', () => {
        const items = findMenuItems(
          BlueskyTimelineItemView({ item: base, ...threadHandlers(), onMuteAuthor: vi.fn() }),
        );

        expect((items ?? []).map(menuSummary)).toEqual([
          { key: 'open-bluesky', label: 'Bluesky で開く', danger: undefined },
          { key: 'copy-link', label: 'リンクをコピー', danger: undefined },
          { key: 'mute-thread', label: 'スレッドをミュート', danger: undefined },
          { key: 'mute', label: '@alice.bsky.social をミュート', danger: true },
        ]);
      });

      it('threadMuted なら「スレッドのミュートを解除」だけを出す', () => {
        const items = findMenuItems(
          BlueskyTimelineItemView({ item: { ...base, threadMuted: true }, ...threadHandlers() }),
        ) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link', 'unmute-thread']);
        expect(items.map((entry) => entry.label)).toContain('スレッドのミュートを解除');
      });

      it('古いキャッシュで threadMuted が無ければ、ミュートとミュート解除を両方出す', () => {
        const { threadMuted: _threadMuted, ...stale } = base;
        const items = findMenuItems(
          BlueskyTimelineItemView({ item: stale as unknown as typeof base, ...threadHandlers() }),
        ) ?? [];

        expect(items.map((entry) => entry.key)).toEqual([
          'open-bluesky',
          'copy-link',
          'mute-thread',
          'unmute-thread',
        ]);
      });

      it('threadMuted が null なら、ミュートとミュート解除をこの順で両方出す', () => {
        const items = findMenuItems(
          BlueskyTimelineItemView({ item: { ...base, threadMuted: null }, ...threadHandlers() }),
        ) ?? [];

        expect(items.map((entry) => entry.key)).toEqual([
          'open-bluesky',
          'copy-link',
          'mute-thread',
          'unmute-thread',
        ]);
        expect(items.map((entry) => entry.label)).toEqual([
          'Bluesky で開く',
          'リンクをコピー',
          'スレッドをミュート',
          'スレッドのミュートを解除',
        ]);
      });

      it('threadMuted が null でも、対応するハンドラが無い項目は出さない', () => {
        const items = findMenuItems(
          BlueskyTimelineItemView({ item: { ...base, threadMuted: null }, onUnmuteThread: vi.fn() }),
        ) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link', 'unmute-thread']);
      });

      it('該当するハンドラが無ければ出さない', () => {
        const muted = findMenuItems(BlueskyTimelineItemView({ item: base, onUnmuteThread: vi.fn() })) ?? [];
        const unmuted = findMenuItems(
          BlueskyTimelineItemView({ item: { ...base, threadMuted: true }, onMuteThread: vi.fn() }),
        ) ?? [];

        expect(muted.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link']);
        expect(unmuted.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link']);
      });

      it('自分の投稿でも出す', () => {
        const items = findMenuItems(
          BlueskyTimelineItemView({ item: { ...base, isOwn: true }, ...threadHandlers() }),
        ) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link', 'mute-thread']);
      });

      it('選ぶと、ミュートでも解除でも、対応するハンドラを item つきで呼ぶ', () => {
        const calls = threadHandlers();
        const mutedItem = { ...base, threadMuted: true };
        const select = (item: typeof base) => {
          for (const entry of findMenuItems(BlueskyTimelineItemView({ item, ...calls })) ?? []) {
            if (entry.kind === 'action') void entry.onSelect();
          }
        };

        select(base);
        select(mutedItem);

        expect(calls.onMuteThread).toHaveBeenCalledExactlyOnceWith(base);
        expect(calls.onUnmuteThread).toHaveBeenCalledExactlyOnceWith(mutedItem);
      });
    });

    describe('作者のモデレーション', () => {
      const handlers = () => ({ onMuteAuthor: vi.fn(), onBlockAuthor: vi.fn(), onReportPost: vi.fn() });

      it('ハンドラがあり他人の投稿なら、ミュート・ブロック・通報を danger で足す', () => {
        expect((findMenuItems(BlueskyTimelineItemView({ item: base, ...handlers() })) ?? []).map(menuSummary)).toEqual([
          { key: 'open-bluesky', label: 'Bluesky で開く', danger: undefined },
          { key: 'copy-link', label: 'リンクをコピー', danger: undefined },
          { key: 'mute', label: '@alice.bsky.social をミュート', danger: true },
          { key: 'block', label: '@alice.bsky.social をブロック', danger: true },
          { key: 'report', label: 'この投稿を通報', danger: true },
        ]);
      });

      it('自分の投稿には出さない', () => {
        const items = findMenuItems(BlueskyTimelineItemView({ item: { ...base, isOwn: true }, ...handlers() })) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link']);
      });

      it('渡されたハンドラの項目だけを出す', () => {
        const items = findMenuItems(BlueskyTimelineItemView({ item: base, onReportPost: vi.fn() })) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link', 'report']);
      });

      it('選ぶと、ハンドラを item つきで呼ぶ', () => {
        const calls = handlers();
        const items = findMenuItems(BlueskyTimelineItemView({ item: base, ...calls })) ?? [];

        for (const entry of items) if (entry.kind === 'action') void entry.onSelect();

        expect(calls.onMuteAuthor).toHaveBeenCalledExactlyOnceWith(base);
        expect(calls.onBlockAuthor).toHaveBeenCalledExactlyOnceWith(base);
        expect(calls.onReportPost).toHaveBeenCalledExactlyOnceWith(base);
      });
    });

    describe('投稿の削除', () => {
      it('自分の投稿でハンドラがあれば、「この投稿を削除」を danger で出す', () => {
        const items = findMenuItems(
          BlueskyTimelineItemView({ item: { ...base, isOwn: true }, onDeletePost: vi.fn() }),
        ) ?? [];

        expect(items.map(menuSummary)).toEqual([
          { key: 'open-bluesky', label: 'Bluesky で開く', danger: undefined },
          { key: 'copy-link', label: 'リンクをコピー', danger: undefined },
          { key: 'delete', label: 'この投稿を削除', danger: true },
        ]);
      });

      it('他人の投稿には、ハンドラがあっても出さない', () => {
        const items = findMenuItems(BlueskyTimelineItemView({ item: base, onDeletePost: vi.fn() })) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link']);
      });

      it('ハンドラが渡されなければ、自分の投稿でも出さない', () => {
        const items = findMenuItems(BlueskyTimelineItemView({ item: { ...base, isOwn: true } })) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link']);
      });

      it('選ぶと、ハンドラを item つきで呼ぶ', () => {
        const onDeletePost = vi.fn();
        const own = { ...base, isOwn: true };
        const items = findMenuItems(BlueskyTimelineItemView({ item: own, onDeletePost })) ?? [];

        for (const entry of items) if (entry.kind === 'action') void entry.onSelect();

        expect(onDeletePost).toHaveBeenCalledExactlyOnceWith(own);
      });
    });

    it('ハンドラが渡されない画面でも、操作の行とトリガーを出す', () => {
      const html = render({});

      expect(html).toContain('class="flex items-center justify-end gap-4 pt-1"');
      expect(html).toContain('aria-controls=');
      expect(html).not.toContain('title="いいね"');
    });

    it('操作のボタンの右端に置く', () => {
      const html = render({}, { onReply: () => {}, onRepost: () => {}, onLike: () => {} });

      expect(html.indexOf('title="いいね"')).toBeLessThan(html.indexOf('aria-controls='));
    });
  });

  describe('いいねのボタン', () => {
    const handlers = { onLike: () => {}, onUndoLike: () => {} };

    it('ハンドラが渡されないときは、いいねのボタンを出さない', () => {
      expect(render({})).not.toContain('title="いいね"');
    });

    it('いいねしていなければ、塗りなしで「いいね」の title の button にする', () => {
      const html = render({ liked: false }, handlers);

      expect(html).toContain('type="button"');
      expect(html).toContain('title="いいね"');
      expect(html).toContain('fill="none"');
      expect(html).not.toContain('disabled');
    });

    it('いいね済みなら、塗りつぶしの色で「いいねを取り消す」の title にする', () => {
      const html = render({ liked: true }, handlers);

      expect(html).toContain('title="いいねを取り消す"');
      expect(html).toContain('fill="currentColor"');
      expect(html).toContain('text-terracotta dark:text-terracotta-light');
    });

    it('送信中は disabled にし、押した後の状態に合わせた title を出す', () => {
      expect(render({ liked: true }, { ...handlers, isLikePending: true })).toContain('title="いいね中..."');
      expect(render({ liked: false }, { ...handlers, isLikePending: true })).toContain(
        'title="いいね取り消し中..."',
      );
      expect(render({ liked: false }, { ...handlers, isLikePending: true })).toContain('disabled');
    });

    it('件数は表示しない', () => {
      expect(render({ liked: true }, handlers)).not.toMatch(/<span class="text-sm">\d+<\/span>/);
    });
  });

  it('Fediverse の投稿と同じく、操作のボタンを右寄せでリポスト、いいねの順に並べる', () => {
    const html = render({}, { onLike: () => {}, onRepost: () => {} });

    expect(html).toContain('class="flex items-center justify-end gap-4 pt-1"');
    expect(html.indexOf('title="リポスト"')).toBeLessThan(html.indexOf('title="いいね"'));
  });

  describe('返信のボタン', () => {
    it('onReply が渡されないときはボタンを出さない', () => {
      expect(render({})).not.toContain('title="返信 (p)"');
      expect(render({}, { onLike: () => {} })).not.toContain('title="返信 (p)"');
    });

    it('onReply が渡されたときは、それだけでも操作の行に「返信 (p)」の button を出す', () => {
      const html = render({}, { onReply: () => {} });

      expect(html).toContain('class="flex items-center justify-end gap-4 pt-1"');
      expect(html).toContain('type="button"');
      expect(html).toContain('title="返信 (p)"');
      expect(html).toContain('fill="none"');
    });

    it('Fediverse の投稿と同じく、返信、リポスト、いいねの順に並べる', () => {
      const html = render({}, { onReply: () => {}, onRepost: () => {}, onLike: () => {} });

      expect(html.indexOf('title="返信 (p)"')).toBeLessThan(html.indexOf('title="リポスト"'));
      expect(html.indexOf('title="リポスト"')).toBeLessThan(html.indexOf('title="いいね"'));
    });

    it('押すと、その投稿を渡して onReply を呼び、親要素へのクリックは伝えない', () => {
      const calls: IoriBlueskyTimelineItemBody[] = [];
      const element = BlueskyTimelineItemView({ item: base, onReply: (item) => calls.push(item) });
      const button = findButtonByTitle(element, '返信 (p)');
      let stopped = false;

      button?.props.onClick({ stopPropagation: () => (stopped = true) });

      expect(calls).toEqual([base]);
      expect(stopped).toBe(true);
    });
  });

  describe('引用のボタン', () => {
    it('onQuote が渡されないときはボタンを出さない', () => {
      expect(render({})).not.toContain('title="引用"');
      expect(render({}, { onReply: () => {}, onLike: () => {}, onRepost: () => {} })).not.toContain('title="引用"');
    });

    it('onQuote が渡されたときは、それだけでも操作の行に「引用」の button を出す', () => {
      const html = render({}, { onQuote: () => {} });

      expect(html).toContain('class="flex items-center justify-end gap-4 pt-1"');
      expect(html).toContain('type="button"');
      expect(html).toContain('title="引用"');
    });

    it('文字ではなく、aria-label が「引用」のアイコンのボタンにする', () => {
      const html = render({}, { onQuote: () => {} });
      const button = html.slice(html.indexOf('<button'), html.indexOf('</button>'));

      expect(button).toContain('aria-label="引用"');
      expect(button).toContain('<svg');
      expect(button.replace(/<[^>]*>/g, '')).not.toContain('引用');
    });

    it('返信、リポスト、引用、いいねの順に並べる', () => {
      const html = render({}, { onReply: () => {}, onRepost: () => {}, onQuote: () => {}, onLike: () => {} });

      expect(html.indexOf('title="返信 (p)"')).toBeLessThan(html.indexOf('title="リポスト"'));
      expect(html.indexOf('title="リポスト"')).toBeLessThan(html.indexOf('title="引用"'));
      expect(html.indexOf('title="引用"')).toBeLessThan(html.indexOf('title="いいね"'));
    });

    it('押すと、その投稿を渡して onQuote を呼び、親要素へのクリックは伝えない', () => {
      const calls: IoriBlueskyTimelineItemBody[] = [];
      const element = BlueskyTimelineItemView({ item: base, onQuote: (item) => calls.push(item) });
      const button = findButtonByTitle(element, '引用');
      let stopped = false;

      button?.props.onClick({ stopPropagation: () => (stopped = true) });

      expect(calls).toEqual([base]);
      expect(stopped).toBe(true);
    });
  });

  describe('リポストのボタン', () => {
    const handlers = { onRepost: () => {}, onUndoRepost: () => {} };

    it('onRepost が渡されないときはボタンを出さない', () => {
      expect(render({})).not.toContain('title="リポスト"');
      expect(render({}, { onLike: () => {} })).not.toContain('title="リポスト"');
    });

    it('リポストしていなければ、塗りなしで「リポスト」の title の button にする', () => {
      const html = render({ reposted: false }, handlers);

      expect(html).toContain('type="button"');
      expect(html).toContain('title="リポスト"');
      expect(html).toContain('fill="none"');
      expect(html).not.toContain('disabled');
    });

    it('リポスト済みなら、塗りつぶしの色で「リポストを取り消す」の title にする', () => {
      const html = render({ reposted: true }, handlers);

      expect(html).toContain('title="リポストを取り消す"');
      expect(html).toContain('fill="currentColor"');
      expect(html).toContain('text-sage dark:text-sage');
    });

    it('送信中は disabled にし、押した後の状態に合わせた title を出す', () => {
      expect(render({ reposted: true }, { ...handlers, isRepostPending: true })).toContain('title="リポスト中..."');
      expect(render({ reposted: false }, { ...handlers, isRepostPending: true })).toContain(
        'title="リポスト取り消し中..."',
      );
      expect(render({ reposted: false }, { ...handlers, isRepostPending: true })).toContain('disabled');
    });

    it('いいねのボタンと並べて出し、リポストの行の表示は変えない', () => {
      const html = render({ repostedByHandle: 'bob.example', reposted: false }, {
        ...handlers,
        onLike: () => {},
        onUndoLike: () => {},
      });

      expect(html).toContain('title="リポスト"');
      expect(html).toContain('title="いいね"');
      expect(html).toContain('@bob.example がリポスト');
    });
  });
});
