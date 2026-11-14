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
  it('本文と情報源の名前の HTML をエスケープする', () => {
    const html = render([
      post({ text: '<script>alert(1)</script><img src=x onerror=alert(2)>', sourceTitle: '@"><b>' }),
    ]);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('http か https でない url にはリンクを付けない', () => {
    const html = render([post({ url: 'javascript:alert(1)' })]);

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
  });
});
