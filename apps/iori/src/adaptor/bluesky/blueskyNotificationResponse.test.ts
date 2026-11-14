import { describe, expect, it } from 'vitest';

import { parseBlueskyNotificationResponse } from './blueskyNotificationResponse.ts';

const AUTHOR = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatar: 'https://cdn.example/alice.jpg',
};
const SUBJECT = 'at://did:plc:me/app.bsky.feed.post/3kmine';

const entry = (overrides: Record<string, unknown> = {}) => ({
  uri: 'at://did:plc:alice/app.bsky.feed.like/3klike',
  cid: 'bafycid',
  author: AUTHOR,
  reason: 'like',
  reasonSubject: SUBJECT,
  record: { $type: 'app.bsky.feed.like' },
  isRead: false,
  indexedAt: '2026-11-08T01:00:05.000Z',
  ...overrides,
});
const parse = (notifications: unknown[], cursor?: string) =>
  parseBlueskyNotificationResponse({ notifications, ...(cursor === undefined ? {} : { cursor }) });
const only = (notifications: unknown[]) => {
  const parsed = parse(notifications);
  if (!parsed.ok) throw new Error('unexpected failure');
  expect(parsed.val.items).toHaveLength(1);
  return parsed.val.items[0]!;
};

describe('parseBlueskyNotificationResponse', () => {
  it('like を reasonSubject つきで変換し、cursor を返す', () => {
    const parsed = parse([entry()], 'next');

    expect(parsed).toEqual({
      ok: true,
      val: {
        cursor: 'next',
        dropped: 0,
        items: [{
          uri: 'at://did:plc:alice/app.bsky.feed.like/3klike',
          reason: 'like',
          subjectUri: SUBJECT,
          indexedAt: Date.UTC(2026, 10, 8, 1, 0, 5),
          author: {
            did: 'did:plc:alice',
            handle: 'alice.bsky.social',
            displayName: 'Alice',
            avatarUrl: 'https://cdn.example/alice.jpg',
          },
        }],
      },
    });
  });

  it('repost は reasonSubject を、follow は subjectUri を持たずに変換する', () => {
    expect(only([entry({ reason: 'repost' })])).toMatchObject({ reason: 'repost', subjectUri: SUBJECT });
    const follow = only([entry({ reason: 'follow', reasonSubject: 'at://did:plc:me/app.bsky.graph.starterpack/3k' })]);
    expect(follow.reason).toBe('follow');
    expect(follow).not.toHaveProperty('subjectUri');
  });

  it('reasonSubject の無い like と repost は壊れた項目として dropped に数える', () => {
    const parsed = parse([entry({ reasonSubject: undefined }), entry({ reason: 'repost', reasonSubject: undefined })]);

    expect(parsed).toMatchObject({ ok: true, val: { items: [], dropped: 2 } });
  });

  it('reply の subjectUri は record.reply.parent.uri にし、無ければ reasonSubject、それも無ければ null にする', () => {
    const withParent = only([
      entry({
        reason: 'reply',
        reasonSubject: 'at://did:plc:me/app.bsky.feed.post/3kroot',
        record: { text: 'hi', reply: { parent: { uri: SUBJECT }, root: { uri: 'at://did:plc:me/x/root' } } },
      }),
    ]);
    const withoutParent = only([entry({ reason: 'reply', record: { text: 'hi' } })]);
    const withoutAny = only([entry({ reason: 'reply', reasonSubject: undefined, record: { text: 'hi' } })]);

    expect(withParent).toMatchObject({ reason: 'reply', subjectUri: SUBJECT, text: 'hi' });
    expect(withoutParent).toMatchObject({ subjectUri: SUBJECT });
    expect(withoutAny).toMatchObject({ subjectUri: null });
  });

  it('quote の subjectUri は record.embed.record.uri にし、recordWithMedia のときは record.embed.record.record.uri にする', () => {
    const plain = only([
      entry({
        reason: 'quote',
        reasonSubject: undefined,
        record: { text: 'q', embed: { $type: 'app.bsky.embed.record', record: { uri: SUBJECT, cid: 'c' } } },
      }),
    ]);
    const withMedia = only([
      entry({
        reason: 'quote',
        reasonSubject: undefined,
        record: {
          text: 'qm',
          embed: {
            $type: 'app.bsky.embed.recordWithMedia',
            record: { $type: 'app.bsky.embed.record', record: { uri: SUBJECT, cid: 'c' } },
            media: { $type: 'app.bsky.embed.images', images: [] },
          },
        },
      }),
    ]);
    const fallback = only([entry({ reason: 'quote', record: { text: 'q' } })]);
    const none = only([entry({ reason: 'quote', reasonSubject: undefined, record: { text: 'q' } })]);

    expect(plain).toMatchObject({ reason: 'quote', subjectUri: SUBJECT, text: 'q' });
    expect(withMedia).toMatchObject({ subjectUri: SUBJECT, text: 'qm' });
    expect(fallback).toMatchObject({ subjectUri: SUBJECT });
    expect(none).toMatchObject({ subjectUri: null });
  });

  it('like-via-repost と repost-via-repost は record.subject.uri の元の投稿を subjectUri にする', () => {
    const original = 'at://did:plc:other/app.bsky.feed.post/3korig';
    const viaRepost = 'at://did:plc:me/app.bsky.feed.repost/3kmyrepost';
    const record = { subject: { uri: original, cid: 'c' }, via: { uri: viaRepost, cid: 'c2' } };

    const like = only([entry({ reason: 'like-via-repost', reasonSubject: viaRepost, record })]);
    const repost = only([entry({ reason: 'repost-via-repost', reasonSubject: viaRepost, record })]);

    expect(like).toMatchObject({ reason: 'like-via-repost', subjectUri: original });
    expect(repost).toMatchObject({ reason: 'repost-via-repost', subjectUri: original });
  });

  it('record.subject が無い via 系の通知は reasonSubject があっても dropped に数える', () => {
    const viaRepost = 'at://did:plc:me/app.bsky.feed.repost/3kmyrepost';

    expect(parse([
      entry({ reason: 'like-via-repost', reasonSubject: viaRepost }),
      entry({ reason: 'repost-via-repost', reasonSubject: viaRepost, record: {} }),
    ])).toMatchObject({ ok: true, val: { items: [], dropped: 2 } });
  });

  it('subscribed-post の subjectUri は reasonSubject があっても null にし、本文は record.text にする', () => {
    const subscribed = only([
      entry({
        uri: 'at://did:plc:alice/app.bsky.feed.post/3knew',
        reason: 'subscribed-post',
        record: { text: 'new post' },
      }),
    ]);

    expect(subscribed).toMatchObject({
      uri: 'at://did:plc:alice/app.bsky.feed.post/3knew',
      reason: 'subscribed-post',
      subjectUri: null,
      text: 'new post',
    });
  });

  it('mention の subjectUri は reasonSubject があっても null にし、本文は record.text にする', () => {
    const mention = only([entry({ reason: 'mention', record: { text: 'hello @me' } })]);

    expect(mention).toMatchObject({ reason: 'mention', subjectUri: null, text: 'hello @me' });
  });

  it('record.text が文字列でなければ本文を空文字にする', () => {
    expect(only([entry({ reason: 'mention', record: { text: 42 } })])).toMatchObject({ text: '' });
    expect(only([entry({ reason: 'mention', record: {} })])).toMatchObject({ text: '' });
  });

  it('未知の reason と対象外の reason は検証を失敗させず、dropped に数える', () => {
    const reasons = [
      'starterpack-joined',
      'verified',
      'unverified',
      'contact-match',
      'something-new',
    ];

    const parsed = parse([...reasons.map((reason) => entry({ reason })), entry({ reason: 'follow' })]);

    expect(parsed).toMatchObject({ ok: true, val: { dropped: reasons.length } });
    expect(parsed.ok && parsed.val.items.map((item) => item.reason)).toEqual(['follow']);
  });

  it('壊れた項目を 1 件ずつ dropped に数え、他の項目は残す', () => {
    const parsed = parse([
      entry({ uri: 'at://good/1', reason: 'follow' }),
      null,
      'text',
      entry({ cid: undefined }),
      entry({ author: { did: 'did:plc:x' } }),
      entry({ record: undefined }),
      entry({ isRead: 'no' }),
      entry({ indexedAt: 'yesterday' }),
      entry({ indexedAt: '1960-01-01T00:00:00.000Z' }),
      entry({ uri: 'at://good/2', reason: 'follow' }),
    ]);

    expect(parsed.ok && parsed.val.items.map((item) => item.uri)).toEqual(['at://good/1', 'at://good/2']);
    expect(parsed.ok && parsed.val.dropped).toBe(8);
  });

  it('displayName が空なら null にし、http(s) でないアバターは null にして項目は捨てない', () => {
    const empty = only([entry({ reason: 'follow', author: { ...AUTHOR, displayName: '' } })]);
    const noName = only([entry({ reason: 'follow', author: { did: AUTHOR.did, handle: AUTHOR.handle } })]);
    const evil = only([entry({ reason: 'follow', author: { ...AUTHOR, avatar: 'javascript:alert(1)' } })]);
    const broken = only([entry({ reason: 'follow', author: { ...AUTHOR, avatar: 'not a url' } })]);

    expect(empty.author.displayName).toBeNull();
    expect(noName.author).toEqual({ did: AUTHOR.did, handle: AUTHOR.handle, displayName: null, avatarUrl: null });
    expect(evil.author.avatarUrl).toBeNull();
    expect(broken.author.avatarUrl).toBeNull();
  });

  it('notifications が配列でない応答は invalid_response にする', () => {
    expect(parseBlueskyNotificationResponse({ cursor: 'x' })).toEqual({ ok: false, err: 'invalid_response' });
    expect(parseBlueskyNotificationResponse({ notifications: 'x' })).toEqual({ ok: false, err: 'invalid_response' });
    expect(parseBlueskyNotificationResponse(null)).toEqual({ ok: false, err: 'invalid_response' });
  });
});
