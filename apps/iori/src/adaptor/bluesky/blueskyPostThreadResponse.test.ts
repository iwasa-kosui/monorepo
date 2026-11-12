import { describe, expect, it } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import { parseBlueskyPostThreadResponse } from './blueskyPostThreadResponse.ts';

const FETCHED_AT = Instant.orThrow(Date.UTC(2026, 10, 8, 12));
const THREAD_VIEW = 'app.bsky.feed.defs#threadViewPost';

const uriOf = (rkey: string, did = 'did:plc:author') => `at://${did}/app.bsky.feed.post/${rkey}`;
const postView = (rkey: string, record: Record<string, unknown> = {}, handle = `${rkey}.bsky.social`) => ({
  uri: uriOf(rkey),
  cid: `cid-${rkey}`,
  author: { did: 'did:plc:author', handle },
  record: {
    $type: 'app.bsky.feed.post',
    text: `text ${rkey}`,
    createdAt: '2026-11-08T01:00:00.000Z',
    ...record,
  },
  indexedAt: '2026-11-08T01:00:05.000Z',
});
const threadView = (rkey: string, extra: Record<string, unknown> = {}, record: Record<string, unknown> = {}) => ({
  $type: THREAD_VIEW,
  post: postView(rkey, record),
  ...extra,
});
const notFoundPost = (rkey: string) => ({
  $type: 'app.bsky.feed.defs#notFoundPost',
  uri: uriOf(rkey),
  notFound: true,
});
const blockedPost = (rkey: string) => ({
  $type: 'app.bsky.feed.defs#blockedPost',
  uri: uriOf(rkey),
  blocked: true,
  author: { did: 'did:plc:author' },
});
const parse = (thread: unknown) => parseBlueskyPostThreadResponse({ thread }, FETCHED_AT);
const parsedOk = (thread: unknown) => {
  const parsed = parse(thread);
  if (!parsed.ok) throw new Error(`unexpected failure: ${parsed.err}`);
  return parsed.val;
};
const nodeLabel = (node: { kind: string; item?: { uri: string }; uri?: string }) =>
  node.kind === 'post' ? node.item!.uri : `${node.kind}:${node.uri}`;

describe('parseBlueskyPostThreadResponse', () => {
  it('本人の投稿を feedItemId を uri にして、いいね・リポストの状態つきで変換する', () => {
    const thread = {
      ...threadView('me'),
      post: {
        ...postView('me'),
        viewer: {
          like: 'at://did:plc:me/app.bsky.feed.like/3klike',
          repost: 'at://did:plc:me/app.bsky.feed.repost/3krepost',
        },
      },
    };

    const { post, ancestors, replies } = parsedOk(thread);

    expect(post).toMatchObject({
      feedItemId: uriOf('me'),
      uri: uriOf('me'),
      cid: 'cid-me',
      repostedByDid: null,
      repostedByHandle: null,
      replyParentUri: null,
      replyParentAuthorHandle: null,
      postedAt: Date.UTC(2026, 10, 8, 1),
      indexedAt: Date.UTC(2026, 10, 8, 1, 0, 5),
      fetchedAt: FETCHED_AT,
      liked: true,
      viewerLikeUri: 'at://did:plc:me/app.bsky.feed.like/3klike',
      reposted: true,
      viewerRepostUri: 'at://did:plc:me/app.bsky.feed.repost/3krepost',
    });
    expect(ancestors).toEqual([]);
    expect(replies).toEqual([]);
  });

  it('祖先を根から直前の親までの順に並べ、親が投稿のときだけ返信先のハンドルを入れる', () => {
    const thread = threadView('me', {
      parent: threadView(
        'parent',
        { parent: threadView('root') },
        { reply: { parent: { uri: uriOf('root') }, root: { uri: uriOf('root') } } },
      ),
    }, { reply: { parent: { uri: uriOf('parent') }, root: { uri: uriOf('root') } } });

    const { ancestors, post } = parsedOk(thread);

    expect(ancestors.map(nodeLabel)).toEqual([uriOf('root'), uriOf('parent')]);
    expect(post).toMatchObject({ replyParentUri: uriOf('parent'), replyParentAuthorHandle: 'parent.bsky.social' });
    expect(ancestors[1]).toMatchObject({
      kind: 'post',
      item: { replyParentUri: uriOf('root'), replyParentAuthorHandle: 'root.bsky.social' },
    });
    expect(ancestors[0]).toMatchObject({ kind: 'post', item: { replyParentUri: null } });
  });

  it('返信の木を、返信の返信が直後に来る深さ優先の平たい配列にする', () => {
    const thread = threadView('me', {
      replies: [
        threadView('a', { replies: [threadView('a1', { replies: [threadView('a1x')] }), threadView('a2')] }),
        threadView('b'),
      ],
    });

    const { replies } = parsedOk(thread);

    expect(replies.map(({ depth, node }) => [depth, nodeLabel(node)])).toEqual([
      [0, uriOf('a')],
      [1, uriOf('a1')],
      [2, uriOf('a1x')],
      [1, uriOf('a2')],
      [0, uriOf('b')],
    ]);
  });

  it('返信の replyParentAuthorHandle に、返信先の投稿者のハンドルを入れる', () => {
    const thread = threadView('me', {
      replies: [threadView('a', { replies: [threadView('a1')] }, { reply: { parent: { uri: uriOf('me') } } })],
    });

    const { replies } = parsedOk(thread);

    expect(replies[0]?.node).toMatchObject({ kind: 'post', item: { replyParentAuthorHandle: 'me.bsky.social' } });
    expect(replies[1]?.node).toMatchObject({ kind: 'post', item: { replyParentAuthorHandle: 'a.bsky.social' } });
  });

  it('見つからない親を notFound のノードにして、そこより上は返さない', () => {
    const thread = threadView('me', { parent: notFoundPost('gone') });

    const { ancestors, post } = parsedOk(thread);

    expect(ancestors).toEqual([{ kind: 'notFound', uri: uriOf('gone') }]);
    expect(post.replyParentAuthorHandle).toBeNull();
  });

  it('ブロックされた返信を blocked のノードにして、ほかの返信は残す', () => {
    const thread = threadView('me', { replies: [blockedPost('blocked'), threadView('ok')] });

    const { replies } = parsedOk(thread);

    expect(replies).toEqual([
      { depth: 0, node: { kind: 'blocked', uri: uriOf('blocked') } },
      { depth: 0, node: expect.objectContaining({ kind: 'post' }) },
    ]);
  });

  it('不明な $type の親と返信を除き、その先は読まない', () => {
    const thread = threadView('me', {
      parent: { $type: 'app.bsky.feed.defs#somethingNew', uri: uriOf('x'), parent: threadView('root') },
      replies: [
        { $type: 'app.bsky.feed.defs#somethingNew', post: postView('x') },
        { post: postView('untyped') },
        threadView('ok'),
      ],
    });

    const { ancestors, replies } = parsedOk(thread);

    expect(ancestors).toEqual([{ kind: 'notFound', uri: uriOf('x') }]);
    expect(replies.map(({ node }) => nodeLabel(node))).toEqual([uriOf('ok')]);
  });

  it('uri の読めない不明な $type の親は、ノードを足さずに止める', () => {
    const thread = threadView('me', { parent: { $type: 'app.bsky.feed.defs#somethingNew' } });

    expect(parsedOk(thread).ancestors).toEqual([]);
  });

  it('投稿として読めない親を、その親の uri の notFound ノードにして、そこより上は返さない', () => {
    const unreadableDate = threadView('badDate', { parent: threadView('root') }, { createdAt: 'not a date' });
    const unreadablePost = { $type: THREAD_VIEW, post: { uri: uriOf('broken') }, parent: threadView('root') };

    expect(parsedOk(threadView('me', { parent: unreadableDate })).ancestors).toEqual([
      { kind: 'notFound', uri: uriOf('badDate') },
    ]);
    expect(parsedOk(threadView('me', { parent: unreadablePost })).ancestors).toEqual([
      { kind: 'notFound', uri: uriOf('broken') },
    ]);
  });

  it('途中の祖先が読めないときも、それより下の祖先は残す', () => {
    const thread = threadView('me', {
      parent: threadView('mid', { parent: threadView('badDate', {}, { createdAt: 'not a date' }) }),
    });

    expect(parsedOk(thread).ancestors.map(nodeLabel)).toEqual([`notFound:${uriOf('badDate')}`, uriOf('mid')]);
  });

  it('投稿として読めない返信を、その返信の木ごと除く', () => {
    const thread = threadView('me', {
      replies: [
        threadView('badDate', { replies: [threadView('child')] }, { createdAt: 'not a date' }),
        { $type: THREAD_VIEW, post: { uri: 'x' } },
        threadView('ok'),
      ],
    });

    const { replies } = parsedOk(thread);

    expect(replies.map(({ node }) => nodeLabel(node))).toEqual([uriOf('ok')]);
  });

  it('引用先が読めない投稿を、recordUnavailable の embed を持つ投稿として読む', () => {
    const thread = {
      ...threadView('me'),
      post: {
        ...postView('me'),
        embed: {
          $type: 'app.bsky.embed.record#view',
          record: { $type: 'app.bsky.embed.record#viewNotFound', uri: uriOf('gone'), notFound: true },
        },
      },
    };

    const { post } = parsedOk(thread);

    expect(post.embed).toEqual({ type: 'recordUnavailable', uri: uriOf('gone'), reason: 'notFound' });
  });

  it('thread 自体が見つからない、またはブロックされているときはエラー種別で返す', () => {
    expect(parse(notFoundPost('me'))).toEqual({ ok: false, err: 'notFound' });
    expect(parse(blockedPost('me'))).toEqual({ ok: false, err: 'blocked' });
  });

  it('thread が無い、不明な $type、本人の投稿が読めない応答を invalid_response にする', () => {
    expect(parseBlueskyPostThreadResponse({}, FETCHED_AT)).toEqual({ ok: false, err: 'invalid_response' });
    expect(parseBlueskyPostThreadResponse(null, FETCHED_AT)).toEqual({ ok: false, err: 'invalid_response' });
    expect(parse({ $type: 'app.bsky.feed.defs#somethingNew' })).toEqual({ ok: false, err: 'invalid_response' });
    expect(parse(threadView('me', {}, { createdAt: 'not a date' }))).toEqual({ ok: false, err: 'invalid_response' });
    expect(parse({ $type: THREAD_VIEW, post: { uri: 'x' } })).toEqual({ ok: false, err: 'invalid_response' });
  });
});
