import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Account } from '../../adaptor/mastodon/entities.ts';
import { accountNoteExcerpt, FediverseAccountRow } from './FediverseAccountRow.tsx';

const account = (overrides: Partial<Account> = {}): Account =>
  ({
    id: 'a1',
    username: 'bob',
    acct: 'bob@remote.example',
    url: 'https://remote.example/@bob',
    uri: 'https://remote.example/users/bob',
    display_name: 'Bob',
    note: '',
    avatar: 'https://remote.example/avatar.png',
    emojis: [],
    ...overrides,
  }) as Account;

const render = (a: Account): string => String(jsx(FediverseAccountRow, { account: a }));

describe('accountNoteExcerpt', () => {
  it('タグを取り除き、文字参照を戻し、空白をまとめる', () => {
    expect(accountNoteExcerpt('<p>Hello&nbsp;<a href="#">world</a></p><p>A &amp; B &#x1F600; &#65;</p>'))
      .toBe('Hello world A & B 😀 A');
  });

  it('長いプロフィール文を切り詰める', () => {
    const excerpt = accountNoteExcerpt(`<p>${'あ'.repeat(200)}</p>`);

    expect([...excerpt]).toHaveLength(121);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

describe('FediverseAccountRow', () => {
  it('リモートのアカウントのページへリンクし、表示名、ハンドル、プロフィール文を出す', () => {
    const html = render(account({ note: '<p>hi there</p>' }));

    expect(html).toContain('href="/remote-users/a1"');
    expect(html).toContain('Bob');
    expect(html).toContain('@bob@remote.example');
    expect(html).toContain('hi there');
    expect(html).not.toContain('<p>hi there</p>');
  });

  it('表示名が空ならユーザー名を出す', () => {
    expect(render(account({ display_name: '  ' }))).toContain('>bob<');
  });
});
