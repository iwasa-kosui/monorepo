import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Account, Status } from '../../adaptor/mastodon/entities.ts';
import { SummaryText } from './SummaryText.tsx';

const status = (id: string, account: Account, uri: string): Status => ({ id, uri, account }) as Status;

const localAccount = { id: 'a1', username: 'kosui', acct: 'kosui', uri: 'https://iori.example/users/kosui' } as Account;
const remoteAccount = {
  id: 'a2',
  username: 'alice',
  acct: 'alice@remote.example',
  uri: 'https://remote.example/users/alice',
} as Account;

const render = (summary: string, citations: Parameters<typeof SummaryText>[0]['citations']): string =>
  String(jsx(SummaryText, { summary, citations }));

describe('SummaryText', () => {
  it('does not turn HTML in the summary into elements', () => {
    const html = render('<script>alert(1)</script> [1]', [
      { n: 1, status: status('p1', localAccount, 'https://iori.example/users/kosui/posts/p1') },
    ]);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<a href="/users/kosui/posts/p1" class="text-terracotta hover:underline">1</a>');
  });

  it('links a remote post to its detail page in iori and leaves unknown numbers as text', () => {
    const html = render('a [2, 9]', [{ n: 2, status: status('p2', remoteAccount, 'https://remote.example/notes/2') }]);

    expect(html).toContain('<a href="/posts/p2" class="text-terracotta hover:underline">2</a>');
    expect(html).not.toContain('remote.example');
    expect(html).toContain(', 9]');
  });

  it('links a remote post whose uri is not http or https to its detail page in iori', () => {
    const html = render('a [2]', [{ n: 2, status: status('p2', remoteAccount, 'javascript:alert(1)') }]);

    expect(html).toContain('href="/posts/p2"');
    expect(html).not.toContain('javascript:');
  });
});
