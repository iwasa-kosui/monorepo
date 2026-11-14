import { describe, expect, it } from 'vitest';

import { blueskyPostgateRecordOf, BlueskyReplyRestriction, blueskyThreadgateRecordOf } from './blueskyInteraction.ts';

const POST = 'at://did:plc:me/app.bsky.feed.post/3kabc';
const CREATED_AT = '2026-11-13T00:00:00.000Z';

describe('BlueskyReplyRestriction', () => {
  it('重複を除き、mention・following・followers の順にそろえる', () => {
    expect(BlueskyReplyRestriction.parse(['followers', 'mention', 'followers'])).toEqual({
      ok: true,
      val: ['mention', 'followers'],
    });
  });
});

describe('blueskyThreadgateRecordOf', () => {
  it('誰でも返信できるなら threadgate を作らない', () => {
    expect(blueskyThreadgateRecordOf({ post: POST, replyRestriction: 'everyone', createdAt: CREATED_AT }))
      .toBeUndefined();
  });

  it('許可する集合を allow の rule にする', () => {
    expect(
      blueskyThreadgateRecordOf({
        post: POST,
        replyRestriction: ['mention', 'following', 'followers'],
        createdAt: CREATED_AT,
      }),
    ).toEqual({
      $type: 'app.bsky.feed.threadgate',
      post: POST,
      allow: [
        { $type: 'app.bsky.feed.threadgate#mentionRule' },
        { $type: 'app.bsky.feed.threadgate#followingRule' },
        { $type: 'app.bsky.feed.threadgate#followerRule' },
      ],
      createdAt: CREATED_AT,
    });
  });

  it('空集合は allow を空にして、誰も返信できないことにする', () => {
    expect(blueskyThreadgateRecordOf({ post: POST, replyRestriction: [], createdAt: CREATED_AT })).toEqual({
      $type: 'app.bsky.feed.threadgate',
      post: POST,
      allow: [],
      createdAt: CREATED_AT,
    });
  });
});

describe('blueskyPostgateRecordOf', () => {
  it('引用を禁止しないなら postgate を作らない', () => {
    expect(blueskyPostgateRecordOf({ post: POST, quoteDisabled: false, createdAt: CREATED_AT })).toBeUndefined();
  });

  it('引用を禁止するなら disableRule の postgate を作る', () => {
    expect(blueskyPostgateRecordOf({ post: POST, quoteDisabled: true, createdAt: CREATED_AT })).toEqual({
      $type: 'app.bsky.feed.postgate',
      post: POST,
      embeddingRules: [{ $type: 'app.bsky.feed.postgate#disableRule' }],
      createdAt: CREATED_AT,
    });
  });
});
