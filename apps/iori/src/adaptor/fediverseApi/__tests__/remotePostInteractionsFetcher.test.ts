import { describe, expect, it } from 'vitest';

import {
  createRemotePostInteractionsFetcher,
  parseMastodonAccounts,
  parseMisskeyReactions,
  parseMisskeyRenotes,
  remotePostApiOf,
} from '../remotePostInteractionsFetcher.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const serve = (routes: Readonly<Record<string, () => Response>>) => {
  const requests: { url: string; method: string; body: string | undefined }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    const route = routes[url];
    if (route === undefined) return new Response('not found', { status: 404 });
    return route();
  }) as typeof fetch;
  return { requests, fetcher: createRemotePostInteractionsFetcher({ fetch: fetchImpl }) };
};

const signal = () => new AbortController().signal;

describe('remotePostApiOf', () => {
  it('Mastodon の URI からは、末尾の ID で Mastodon の API を使う', () => {
    expect(remotePostApiOf({ uri: 'https://mastodon.example/users/alice/statuses/1234', url: null })).toEqual({
      type: 'mastodon',
      origin: 'https://mastodon.example',
      statusId: '1234',
      hasPleromaReactions: false,
    });
  });

  it('Misskey の URI からは、ノートの ID で Misskey の API を使う', () => {
    expect(remotePostApiOf({ uri: 'https://misskey.example/notes/9abc', url: null })).toEqual({
      type: 'misskey',
      origin: 'https://misskey.example',
      noteId: '9abc',
    });
  });

  it('Pleroma は URI に ID がないので、url の notice から ID を取り、リアクションも読む', () => {
    expect(remotePostApiOf({
      uri: 'https://pleroma.example/objects/0b0e0c2e-1111-2222-3333-444455556666',
      url: 'https://pleroma.example/notice/AbCdEf123',
    })).toEqual({
      type: 'mastodon',
      origin: 'https://pleroma.example',
      statusId: 'AbCdEf123',
      hasPleromaReactions: true,
    });
  });

  it('url が別のホストを指していても、そのホストの ID は使わない', () => {
    expect(remotePostApiOf({
      uri: 'https://pleroma.example/objects/0b0e0c2e',
      url: 'https://evil.example/notice/AbCdEf123',
    })).toBeUndefined();
  });

  it.each([
    ['https でない', 'http://mastodon.example/users/alice/statuses/1'],
    ['IP アドレス', 'https://192.168.0.1/users/alice/statuses/1'],
    ['localhost', 'https://localhost/notes/1'],
    ['ID に記号が入っている', 'https://mastodon.example/users/alice/statuses/1%2F..%2Fadmin'],
    ['ID を取り出せない', 'https://example.com/p/alice/1'],
  ])('%s URI では API を使わない', (_name, uri) => {
    expect(remotePostApiOf({ uri, url: null })).toBeUndefined();
  });
});

describe('相手のサーバーの応答の解釈', () => {
  it('Mastodon のアカウントは、そのサーバーの人の acct にホストを補う', () => {
    const accounts = parseMastodonAccounts([
      {
        username: 'alice',
        acct: 'alice',
        display_name: 'Alice',
        avatar: 'https://m.example/a.png',
        url: 'https://m.example/@alice',
      },
      { username: 'bob', acct: 'bob@other.example', display_name: '', avatar: null, url: null },
    ], 'm.example');

    expect(accounts).toEqual([
      {
        actorId: null,
        isLocal: false,
        name: 'Alice',
        acct: 'alice@m.example',
        avatarUrl: 'https://m.example/a.png',
        url: 'https://m.example/@alice',
      },
      { actorId: null, isLocal: false, name: 'bob', acct: 'bob@other.example', avatarUrl: null, url: null },
    ]);
  });

  it('形の合わない要素は捨て、https でない URL は使わない', () => {
    const accounts = parseMastodonAccounts([
      null,
      'alice',
      { username: 'no-acct' },
      { username: 'eve', acct: 'eve', avatar: 'javascript:alert(1)', url: 'http://m.example/@eve' },
    ], 'm.example');

    expect(accounts).toEqual([
      { actorId: null, isLocal: false, name: 'eve', acct: 'eve@m.example', avatarUrl: null, url: null },
    ]);
    expect(parseMastodonAccounts({ error: 'This method requires an authenticated user' }, 'm.example')).toEqual([]);
  });

  it('Misskey のリアクションは絵文字ごとにまとめ、カスタム絵文字は :name: の形と画像の URL にする', () => {
    const user = (username: string, host: string | null = null) => ({ username, host, name: null, avatarUrl: null });
    const reactions = parseMisskeyReactions([
      { type: '👍', user: user('alice') },
      { type: ':blobcat@.:', user: user('bob') },
      { type: '👍', user: user('carol', 'other.example') },
      { type: ':party@other.example:', user: user('carol', 'other.example') },
    ], 'https://misskey.example');

    expect(reactions.map((reaction) => [reaction.emoji, reaction.emojiImageUrl, reaction.actors.map((a) => a.acct)]))
      .toEqual([
        ['👍', null, ['alice@misskey.example', 'carol@other.example']],
        [':blobcat:', 'https://misskey.example/emoji/blobcat.webp', ['bob@misskey.example']],
        [':party:', 'https://misskey.example/emoji/party@other.example.webp', ['carol@other.example']],
      ]);
  });

  it('Misskey の引用リノート（本文つき）は、リポストした人に数えない', () => {
    const user = { username: 'alice', host: null, name: 'Alice', avatarUrl: null };
    const renotes = parseMisskeyRenotes([
      { text: null, user },
      { text: 'これいいね', user: { ...user, username: 'bob' } },
    ], 'https://misskey.example');

    expect(renotes.map((renote) => renote.acct)).toEqual(['alice@misskey.example']);
  });
});

describe('createRemotePostInteractionsFetcher', () => {
  const alice = { username: 'alice', acct: 'alice', display_name: 'Alice', avatar: null, url: null };

  it('Mastodon からは、いいねした人とリポストした人を読む', async () => {
    const base = 'https://mastodon.example/api/v1/statuses/1234';
    const t = serve({
      [`${base}/favourited_by?limit=80`]: () => json([alice]),
      [`${base}/reblogged_by?limit=80`]: () => json([{ ...alice, username: 'bob', acct: 'bob' }]),
    });

    const result = await t.fetcher.fetch(
      { uri: 'https://mastodon.example/users/x/statuses/1234', url: null },
      signal(),
    );

    expect(result.likes.map((actor) => actor.acct)).toEqual(['alice@mastodon.example']);
    expect(result.reposts.map((actor) => actor.acct)).toEqual(['bob@mastodon.example']);
    expect(result.reactions).toEqual([]);
  });

  it('片方の取得に失敗しても、読めたほうは返す', async () => {
    const base = 'https://mastodon.example/api/v1/statuses/1234';
    const t = serve({
      [`${base}/favourited_by?limit=80`]: () => json({ error: 'unauthorized' }, 401),
      [`${base}/reblogged_by?limit=80`]: () => json([alice]),
    });

    const result = await t.fetcher.fetch(
      { uri: 'https://mastodon.example/users/x/statuses/1234', url: null },
      signal(),
    );

    expect(result.likes).toEqual([]);
    expect(result.reposts.map((actor) => actor.acct)).toEqual(['alice@mastodon.example']);
  });

  it('JSON でない応答やリダイレクトは、反応なしとして扱う', async () => {
    const base = 'https://mastodon.example/api/v1/statuses/1234';
    const t = serve({
      [`${base}/favourited_by?limit=80`]: () => new Response('<html>', { status: 200 }),
      [`${base}/reblogged_by?limit=80`]: () =>
        new Response(null, { status: 302, headers: { Location: 'https://internal.example/' } }),
    });

    const result = await t.fetcher.fetch(
      { uri: 'https://mastodon.example/users/x/statuses/1234', url: null },
      signal(),
    );

    expect(result).toEqual({ likes: [], reposts: [], reactions: [] });
    expect(t.requests.map((request) => new URL(request.url).host)).toEqual(['mastodon.example', 'mastodon.example']);
  });

  it('Misskey からは、ノートの ID を本文に入れてリアクションとリノートを読む', async () => {
    const user = { username: 'alice', host: null, name: null, avatarUrl: null };
    const t = serve({
      'https://misskey.example/api/notes/reactions': () => json([{ type: '🎉', user }]),
      'https://misskey.example/api/notes/renotes': () => json([{ text: null, user }]),
    });

    const result = await t.fetcher.fetch({ uri: 'https://misskey.example/notes/9abc', url: null }, signal());

    expect(result.reactions.map((reaction) => reaction.emoji)).toEqual(['🎉']);
    expect(result.reposts.map((actor) => actor.acct)).toEqual(['alice@misskey.example']);
    expect(t.requests.every((request) => request.method === 'POST')).toBe(true);
    expect(t.requests.map((request) => JSON.parse(request.body ?? '{}').noteId)).toEqual(['9abc', '9abc']);
  });

  it('API を決められない投稿では、どこにも問い合わせない', async () => {
    const t = serve({});

    const result = await t.fetcher.fetch({ uri: 'https://192.168.0.1/notes/1', url: null }, signal());

    expect(result).toEqual({ likes: [], reposts: [], reactions: [] });
    expect(t.requests).toEqual([]);
  });
});
