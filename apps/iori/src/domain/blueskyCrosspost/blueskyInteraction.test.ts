import { describe, expect, it } from 'vitest';

import {
  BlueskyInteraction,
  blueskyPostgateRecordOf,
  blueskyPostUriOf,
  BlueskyReplyRestriction,
  blueskyThreadgateRecordOf,
} from './blueskyInteraction.ts';

const POST = 'at://did:plc:me/app.bsky.feed.post/3kabc';
const CREATED_AT = '2026-11-13T00:00:00.000Z';

describe('BlueskyReplyRestriction', () => {
  it('everyone と、mention・following・followers の部分集合 (空集合を含む) を受け付ける', () => {
    expect(BlueskyReplyRestriction.parse('everyone')).toEqual({ ok: true, val: 'everyone' });
    expect(BlueskyReplyRestriction.parse([])).toEqual({ ok: true, val: [] });
    expect(BlueskyReplyRestriction.parse(['following'])).toEqual({ ok: true, val: ['following'] });
  });

  it('重複を除き、mention・following・followers の順にそろえる', () => {
    expect(BlueskyReplyRestriction.parse(['followers', 'mention', 'followers'])).toEqual({
      ok: true,
      val: ['mention', 'followers'],
    });
  });

  it('未知の値と配列でない値を拒否する', () => {
    expect(BlueskyReplyRestriction.parse(['list']).ok).toBe(false);
    expect(BlueskyReplyRestriction.parse('mention').ok).toBe(false);
    expect(BlueskyReplyRestriction.parse(null).ok).toBe(false);
  });
});

describe('BlueskyInteraction', () => {
  it('既定は誰でも返信できて引用も許可する', () => {
    expect(BlueskyInteraction.default).toEqual({ replyRestriction: 'everyone', quoteDisabled: false });
    expect(BlueskyInteraction.isDefault(BlueskyInteraction.default)).toBe(true);
  });

  it('返信の制限か引用の禁止があれば既定ではない', () => {
    expect(BlueskyInteraction.isDefault({ replyRestriction: [], quoteDisabled: false })).toBe(false);
    expect(BlueskyInteraction.isDefault({ replyRestriction: ['mention'], quoteDisabled: false })).toBe(false);
    expect(BlueskyInteraction.isDefault({ replyRestriction: 'everyone', quoteDisabled: true })).toBe(false);
  });
});

describe('blueskyPostUriOf', () => {
  it('did と rkey から投稿の at-uri を作る', () => {
    expect(blueskyPostUriOf({ did: 'did:plc:me', rkey: '3kabc' })).toBe(POST);
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
