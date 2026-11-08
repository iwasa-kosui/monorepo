import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriXPostBody } from '../../adaptor/routes/workerIoriXPostsRouter.ts';
import { XPostList } from './XPostList.tsx';

const post = (overrides: Partial<IoriXPostBody> = {}): IoriXPostBody => ({
  feedEntryId: '00000000-0000-4000-8000-000000000001',
  sourceTitle: '@jack',
  text: '本文',
  url: 'https://x.com/jack/status/1',
  postedAt: '2026-11-06T01:00:00.000Z',
  ...overrides,
});

const render = (posts: readonly IoriXPostBody[]): string => String(jsx(XPostList, { posts }));

describe('XPostList', () => {
  it('情報源の名前、本文、投稿日時、元の投稿へのリンクを出す', () => {
    const html = render([post()]);

    expect(html).toContain('@jack');
    expect(html).toContain('本文');
    expect(html).toContain('datetime="2026-11-06T01:00:00.000Z"');
    expect(html).toContain('href="https://x.com/jack/status/1"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('本文と情報源の名前の HTML をエスケープする', () => {
    const html = render([
      post({ text: '<script>alert(1)</script><img src=x onerror=alert(2)>', sourceTitle: '@"><b>' }),
    ]);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('本文中の URL をリンクにしない', () => {
    const html = render([post({ text: 'see https://example.com/a' })]);

    expect(html).toContain('see https://example.com/a');
    expect(html).not.toContain('href="https://example.com/a"');
  });

  it('http か https でない url にはリンクを付けない', () => {
    const html = render([post({ url: 'javascript:alert(1)' })]);

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
  });

  it('渡された順に並べる', () => {
    const html = render([
      post({ feedEntryId: 'a', text: '一件目' }),
      post({ feedEntryId: 'b', text: '二件目' }),
    ]);

    expect(html.indexOf('一件目')).toBeLessThan(html.indexOf('二件目'));
  });
});
