import { describe, expect, it } from 'vitest';

import {
  BLUESKY_REPORT_COMMENT_MAX_LENGTH,
  blueskyBlockUri,
  BlueskyDid,
  BlueskyReportCategory,
  BlueskyReportComment,
  blueskyReportReasonType,
  parseBlueskyBlockUri,
} from './blueskyModeration.ts';

describe('blueskyReportReasonType', () => {
  it('category を Bluesky の reasonType に対応づける', () => {
    expect(blueskyReportReasonType('spam')).toBe('com.atproto.moderation.defs#reasonSpam');
    expect(blueskyReportReasonType('offensive')).toBe('com.atproto.moderation.defs#reasonRude');
    expect(blueskyReportReasonType('other')).toBe('com.atproto.moderation.defs#reasonOther');
  });
});

describe('BlueskyReportCategory', () => {
  it('spam、offensive、other だけを受ける', () => {
    expect(BlueskyReportCategory.parse('spam').ok).toBe(true);
    expect(BlueskyReportCategory.parse('offensive').ok).toBe(true);
    expect(BlueskyReportCategory.parse('other').ok).toBe(true);
    expect(BlueskyReportCategory.parse('rude').ok).toBe(false);
    expect(BlueskyReportCategory.parse(undefined).ok).toBe(false);
  });
});

describe('BlueskyReportComment', () => {
  it('前後の空白を取り除く', () => {
    expect(BlueskyReportComment.parse('  理由  ')).toMatchObject({ ok: true, val: '理由' });
    expect(BlueskyReportComment.parse('   ')).toMatchObject({ ok: true, val: '' });
  });

  it('trim の後で 2000 文字までを受ける', () => {
    const limit = 'あ'.repeat(BLUESKY_REPORT_COMMENT_MAX_LENGTH);

    expect(BlueskyReportComment.parse(limit).ok).toBe(true);
    expect(BlueskyReportComment.parse(` ${limit} `).ok).toBe(true);
    expect(BlueskyReportComment.parse(`${limit}あ`).ok).toBe(false);
  });
});

describe('BlueskyDid', () => {
  it('did: で始まる文字列だけを受ける', () => {
    expect(BlueskyDid.parse('did:plc:abc').ok).toBe(true);
    expect(BlueskyDid.parse('alice.bsky.social').ok).toBe(false);
    expect(BlueskyDid.parse('').ok).toBe(false);
  });
});

describe('block の at-uri', () => {
  it('app.bsky.graph.block の uri だけを受け、repo と rkey に分ける', () => {
    const uri = 'at://did:plc:me/app.bsky.graph.block/3kblock';

    expect(blueskyBlockUri(uri)).toBe(uri);
    expect(parseBlueskyBlockUri(uri)).toEqual({ repo: 'did:plc:me', rkey: '3kblock' });
  });

  it('リストや投稿の uri、空の値は受けない', () => {
    expect(blueskyBlockUri('at://did:plc:me/app.bsky.graph.list/3klist')).toBeUndefined();
    expect(blueskyBlockUri('at://did:plc:me/app.bsky.feed.post/3k1')).toBeUndefined();
    expect(blueskyBlockUri('at://did:plc:me/app.bsky.graph.block/3k1/extra')).toBeUndefined();
    expect(blueskyBlockUri(null)).toBeUndefined();
    expect(blueskyBlockUri(undefined)).toBeUndefined();
    expect(parseBlueskyBlockUri('at://did:plc:me/app.bsky.graph.list/3klist')).toBeUndefined();
  });
});
