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

  describe('引用', () => {
    const quoteUri = 'at://did:plc:q/app.bsky.feed.post/3kq';
    const quoteHref = '/bluesky/profile/did:plc:q/post/3kq';
    const record = { type: 'record', uri: quoteUri, authorHandle: 'q.bsky.social', text: '引用本文' } as const;
    const nestedAnchor = /<a\b(?:(?!<\/a>)[\s\S])*<a\b/;

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
  });

  it('返信先の uri が at-uri として読めなければ、リンクにしない', () => {
    const html = render({ replyParentUri: 'nope', replyParentAuthorHandle: null });

    expect(html).toContain('>返信</div>');
    expect(html).not.toMatch(/<a [^>]*>返信<\/a>/);
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
    });

    describe('スレッドのミュート', () => {
      const threadHandlers = () => ({ onMuteThread: vi.fn(), onUnmuteThread: vi.fn() });

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
    });

    describe('作者のモデレーション', () => {
      const handlers = () => ({ onMuteAuthor: vi.fn(), onBlockAuthor: vi.fn(), onReportPost: vi.fn() });

      it('自分の投稿には出さない', () => {
        const items = findMenuItems(BlueskyTimelineItemView({ item: { ...base, isOwn: true }, ...handlers() })) ?? [];

        expect(items.map((entry) => entry.key)).toEqual(['open-bluesky', 'copy-link']);
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
    });
  });

  describe('返信のボタン', () => {
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
});
