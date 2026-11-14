import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../src/adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../src/adaptor/d1/__tests__/sqliteFixture.ts';
import { EmojiReact } from '../../src/domain/emojiReact/emojiReact.ts';
import { FederatedTimelineItem } from '../../src/domain/federatedTimeline/federatedTimelineItem.ts';
import { Instant } from '../../src/domain/instant/instant.ts';
import { Like } from '../../src/domain/like/like.ts';
import { Notification } from '../../src/domain/notification/notification.ts';
import { Post } from '../../src/domain/post/post.ts';
import { Repost } from '../../src/domain/repost/repost.ts';
import { TimelineItem } from '../../src/domain/timeline/timelineItem.ts';
import {
  applySql,
  deleteBlockedDomainPosts,
  deleteFailureLines,
  dryRunSql,
  hostMatches,
} from '../delete-blocked-domain-posts.mjs';

const accountId = 'b'.repeat(32);
const token = 'api-token-value-for-fixture-0123456789';
const generation = 'prd20261102a';
const databaseName = `iori-production-${generation}`;
const databaseUuid = '11111111-1111-4111-8111-111111111111';
const databasePath = `/accounts/${accountId}/d1/database/${databaseUuid}`;
const now = 1_800_000_000_000;
const env = (overrides: Record<string, string | undefined> = {}) => ({
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: generation,
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: token,
  ...overrides,
});
const diag = (stage: string, reason: string) =>
  `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`;
const json = (result: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, errors: [], messages: [], result }), { status });

type Fixture = ReturnType<typeof createSqliteD1Fixture>;
type Row = Record<string, unknown>;
const rows = (fixture: Fixture, sql: string) => fixture.sqlite.prepare(sql).all() as Row[];
const count = (fixture: Fixture, table: string, where = '1 = 1') =>
  Number((rows(fixture, `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0] as { n: number | bigint }).n);
const column = (fixture: Fixture, sql: string) => rows(fixture, sql).map((row) => String(Object.values(row)[0])).sort();

const build = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const { sqlite } = fixture;
  const local = seed.addLocalActor('alice');
  const mallory = seed.addLocalActor('mallory');
  sqlite.prepare('UPDATE actors SET uri = ? WHERE actorId = ?').run(
    'https://baraag.net/users/mallory',
    mallory.actorId,
  );
  const bara = seed.addRemoteActor('b1', 'baraag.net');
  const sub = seed.addRemoteActor('b2', 'media.baraag.net');
  const notbaraag = seed.addRemoteActor('n1', 'notbaraag.net');
  const example = seed.addRemoteActor('n2', 'baraag.net.example');
  const pathy = seed.addRemoteActor('n3', 'evil.example/x.baraag.net');
  const other = seed.addRemoteActor('o1');
  const relay1 = seed.addRelay();
  const relay2 = seed.addRelay();

  const localPost = seed.addLocalPost(local, 90, { timeline: true });
  const bp1 = seed.addRemotePost(bara, 100, { timeline: true, recipientActorUris: [`https://iori.test/users/alice`] });
  const bp2 = seed.addRemotePost(sub, 110, { timeline: true });
  const article = seed.addRemotePost(bara, 120, { timeline: true });
  const kept = {
    notbaraag: seed.addRemotePost(notbaraag, 130, {
      timeline: true,
      recipientActorUris: [`https://iori.test/users/alice`],
    }),
    example: seed.addRemotePost(example, 131, { timeline: true }),
    pathy: seed.addRemotePost(pathy, 132, { timeline: true }),
    other: seed.addRemotePost(other, 133, { timeline: true }),
    mallory: seed.addLocalPost(mallory, 134, { timeline: true }),
  };
  sqlite.prepare('UPDATE remote_posts SET uri = ? WHERE postId = ?').run('https://baraag.net/@b1/1', bp1.postId);
  sqlite.prepare('UPDATE remote_posts SET uri = ? WHERE postId = ?').run('https://media.baraag.net/@b2/1', bp2.postId);
  sqlite.prepare('UPDATE remote_posts SET uri = ? WHERE postId = ?').run('https://baraag.net/@o1/1', kept.other.postId);

  sqlite.prepare('INSERT INTO post_quotes(postId,quoteUri) VALUES (?,?)').run(
    bp1.postId,
    'https://remote.example/notes/q1',
  );
  sqlite.prepare('INSERT INTO post_quotes(postId,quoteUri) VALUES (?,?)').run(
    kept.notbaraag.postId,
    'https://remote.example/notes/q2',
  );

  sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(seed.uuid(), local.actorId, local.userId, article.postId, 'title', 'published', 1, 1, null);

  const imageIds = [
    seed.addImage(bp1.postId, 'https://example.test/1.png'),
    seed.addImage(bp1.postId, 'https://example.test/2.png'),
    seed.addImage(kept.notbaraag.postId, 'https://example.test/3.png'),
    seed.addImage(article.postId, 'https://example.test/4.png'),
  ];
  seed.addLinkPreview(bp1.postId, 'https://example.test/link', 'Site', null);
  sqlite.prepare(
    'INSERT INTO post_translations(postId,targetLanguage,sourceHash,content,detectedSourceLanguage,model,createdAt) VALUES (?,?,?,?,?,?,?)',
  ).run(bp1.postId, 'ja', 'hash', 'content', 'en', 'model', 1);

  const reposts = {
    otherOfBp1: seed.addRepost(other.actorId, bp1.postId, 200),
    subOfBp2: seed.addRepost(sub.actorId, bp2.postId, 201),
    baraOfKept: seed.addRepost(bara.actorId, kept.notbaraag.postId, 202),
    otherOfArticle: seed.addRepost(other.actorId, article.postId, 203),
  };

  const localLike = seed.addLike(other.actorId, bp1.postId);
  sqlite.prepare('INSERT INTO local_likes(likeId) VALUES (?)').run(localLike.likeId);
  const remoteLikeId = seed.uuid();
  sqlite.prepare('INSERT INTO likes(likeId,actorId,postId,type,createdAt) VALUES (?,?,?,?,?)').run(
    remoteLikeId,
    other.actorId,
    bp2.postId,
    'remote',
    1,
  );
  sqlite.prepare('INSERT INTO remote_likes(likeId,likeActivityUri) VALUES (?,?)').run(
    remoteLikeId,
    'https://remote.example/likes/1',
  );
  const keptLike = seed.addLike(other.actorId, kept.notbaraag.postId);
  seed.addEmojiReact(other.actorId, bp1.postId, ':a:');
  seed.addEmojiReact(other.actorId, bp2.postId, ':b:', 'https://example.test/b.png');
  seed.addEmojiReact(other.actorId, kept.notbaraag.postId, ':c:');

  const federated = {
    bp1: seed.addFederatedItem(bp1.postId, relay1, 5),
    bp2: seed.addFederatedItem(bp2.postId, relay2, 6),
    kept: seed.addFederatedItem(kept.notbaraag.postId, relay1, 7),
    article: seed.addFederatedItem(article.postId, relay1, 8),
  };

  const notifications = {
    likeOnBp1: seed.addLikeNotification(local.userId, other.actorId, bp1.postId, 1),
    emojiOnBp1: seed.addEmojiReactNotification(local.userId, other.actorId, bp1.postId, 2),
    replyFromBp2: seed.addReplyNotification(local.userId, sub.actorId, bp2.postId, localPost.postId, 3),
    replyToBp1: seed.addReplyNotification(local.userId, other.actorId, kept.other.postId, bp1.postId, 4),
    mentionOnBp1: seed.addMentionNotification(local.userId, other.actorId, bp1.postId, 10),
    mentionOnKept: seed.addMentionNotification(local.userId, other.actorId, kept.notbaraag.postId, 11),
    repostOfBp2: seed.addRepostNotification(local.userId, other.actorId, bp2.postId, 5),
    likeOnKept: seed.addLikeNotification(local.userId, other.actorId, kept.notbaraag.postId, 6),
    replyOnKept: seed.addReplyNotification(local.userId, other.actorId, kept.other.postId, localPost.postId, 7),
    likeOnArticle: seed.addLikeNotification(local.userId, other.actorId, article.postId, 8),
    follow: seed.addFollowNotification(local.userId, bara.actorId, 9),
  };

  seed.addFollow(local.actorId, bara.actorId);
  seed.addFollow(local.actorId, other.actorId);
  seed.addFollow(sub.actorId, local.actorId);
  seed.addFollow(other.actorId, bara.actorId);
  seed.addMute(local.userId, bara.actorId);
  seed.addMute(local.userId, other.actorId);

  return {
    fixture,
    seed,
    local,
    bara,
    sub,
    other,
    localPost,
    bp1,
    bp2,
    article,
    kept,
    imageIds,
    reposts,
    localLike,
    remoteLikeId,
    keptLike,
    federated,
    notifications,
  };
};

type Call = { method: string; path: string; sql?: string };
const fakeFetch = (fixture: Fixture, options: { names?: string[]; uuid?: string } = {}) => {
  const calls: Call[] = [];
  const fetchRequest = async (url: URL, init: RequestInit) => {
    const path = url.pathname.replace('/client/v4', '');
    const method = String(init.method);
    const sql = init.body === undefined ? undefined : (JSON.parse(String(init.body)) as { sql: string }).sql;
    calls.push({ method, path, sql });
    if (method === 'GET' && path === `/accounts/${accountId}/d1/database`) {
      const items = (options.names ?? [databaseName, 'iori']).map((name) => ({
        name,
        uuid: options.uuid ?? databaseUuid,
      }));
      return json(items);
    }
    if (method === 'GET' && path === databasePath) return json({ name: databaseName, uuid: databaseUuid });
    if (method === 'POST' && path === `${databasePath}/query`) {
      fixture.sqlite.exec('BEGIN');
      try {
        const results = sql!.split(';\n').map((statement) => {
          const prepared = fixture.sqlite.prepare(statement);
          return /^\s*SELECT/i.test(statement)
            ? { results: prepared.all(), success: true, meta: {} }
            : (prepared.run(), { results: [], success: true, meta: {} });
        });
        fixture.sqlite.exec('COMMIT');
        return json(results);
      } catch (error) {
        fixture.sqlite.exec('ROLLBACK');
        throw error;
      }
    }
    return json(null, 404);
  };
  return { calls, fetchRequest: fetchRequest as unknown as typeof fetch };
};
const run = async (
  mode: 'dry-run' | 'apply',
  fixture: Fixture,
  overrides: Record<string, string | undefined> = {},
  options: { names?: string[]; uuid?: string; at?: number } = {},
) => {
  const { calls, fetchRequest } = fakeFetch(fixture, options);
  const notices: string[] = [];
  let error: unknown;
  try {
    await deleteBlockedDomainPosts({
      env: env(overrides),
      mode,
      fetchRequest,
      notice: (line) => notices.push(line),
      now: options.at ?? now,
    });
  } catch (caught) {
    error = caught;
  }
  const queries = calls.filter((call) => call.method === 'POST').map((call) => call.sql!);
  return { calls, queries, notices, error };
};

const SNAPSHOT_TABLES: Array<[string, string]> = [
  ['posts', 'postId'],
  ['remote_posts', 'postId'],
  ['local_posts', 'postId'],
  ['remote_post_recipients', 'postId, actorUri'],
  ['direct_post_participants', 'postId, actorUri'],
  ['post_quotes', 'postId'],
  ['post_images', 'imageId'],
  ['link_previews', 'linkPreviewId'],
  ['post_translations', 'postId, targetLanguage'],
  ['timeline_items', 'timelineItemId'],
  ['notifications', 'notificationId'],
  ['notification_likes', 'notificationId'],
  ['notification_emoji_reacts', 'notificationId'],
  ['notification_replies', 'notificationId'],
  ['notification_mentions', 'notificationId'],
  ['notification_reposts', 'notificationId'],
  ['notification_follows', 'notificationId'],
  ['reposts', 'repostId'],
  ['likes', 'likeId'],
  ['local_likes', 'likeId'],
  ['remote_likes', 'likeId'],
  ['emoji_reacts', 'emojiReactId'],
  ['federated_timeline_items', 'federatedTimelineItemId'],
  ['actors', 'actorId'],
  ['remote_actors', 'actorId'],
  ['follows', 'followerId, followingId'],
  ['mutes', 'muteId'],
  ['articles', 'articleId'],
];
const eventRows = (fixture: Fixture) =>
  rows(
    fixture,
    'SELECT aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt, typeof(occurredAt) AS occurredType, typeof(aggregateState) AS stateType FROM domain_events ORDER BY eventName, aggregateId',
  );
const snapshot = (fixture: Fixture) => ({
  ...Object.fromEntries(
    SNAPSHOT_TABLES.map(([table, order]) => [table, rows(fixture, `SELECT * FROM ${table} ORDER BY ${order}`)]),
  ),
  events: eventRows(fixture),
});
const ids = (...items: Array<string | undefined>) => items.map(String).sort();

describe('delete-blocked-domain-posts input checks', () => {
  it.each([
    ['staging', { IORI_ENVIRONMENT: 'staging' }],
    ['without a generation', { IORI_GENERATION: '' }],
    ['with a malformed generation', { IORI_GENERATION: 'Bad-Generation' }],
    ['with a bad account id', { CLOUDFLARE_ACCOUNT_ID: 'not-hex' }],
  ])('fails without any request when the input is %s', async (_label, overrides) => {
    for (const mode of ['dry-run', 'apply'] as const) {
      const { fixture } = build();
      const { calls, error, notices } = await run(mode, fixture, overrides);
      expect(calls).toEqual([]);
      expect(notices).toEqual([]);
      expect(deleteFailureLines(error)).toEqual([diag('delete-posts', 'config-invalid')]);
    }
  });
  it.each(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])(
    'fails without any request when %s is empty',
    async (name) => {
      const { fixture } = build();
      const { calls, error } = await run('apply', fixture, { [name]: '' });
      expect(calls).toEqual([]);
      expect(deleteFailureLines(error)).toEqual([diag('delete-posts', 'credentials-missing')]);
    },
  );
  it.each([
    ['is missing', [], 'resource-missing'],
    ['is listed twice', [databaseName, databaseName], 'resource-ambiguous'],
    ['only has lookalikes', [`${databaseName}-x`, 'iori'], 'resource-missing'],
  ])('fails without a query when the D1 name %s', async (_label, names, reason) => {
    const { fixture } = build();
    const { calls, error } = await run('apply', fixture, {}, { names });
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    expect(deleteFailureLines(error)).toEqual([diag('delete-posts-resolve', reason)]);
  });
  it('fails without a query when the listed id is not a UUID', async () => {
    const { fixture } = build();
    const { calls, error } = await run('apply', fixture, {}, { uuid: '../../x' });
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    expect(deleteFailureLines(error)).toEqual([diag('delete-posts-resolve', 'result-invalid')]);
  });
  it('keeps the token, the account id and ids out of the failure lines', async () => {
    const { fixture } = build();
    const { error } = await run('apply', fixture, {}, { names: [] });
    for (const line of deleteFailureLines(error)) {
      expect(line).not.toContain(token);
      expect(line).not.toContain(accountId);
      expect(line).not.toContain(databaseUuid);
    }
  });
});

describe('delete-blocked-domain-posts host condition', () => {
  const matches = (fixture: Fixture, uri: string) =>
    Number(
      (fixture.sqlite.prepare(`SELECT ${hostMatches('t.uri')} AS matched FROM (SELECT ? AS uri) t`).get(uri) as Row)
        .matched,
    );
  it.each([
    'https://baraag.net/users/a',
    'https://media.baraag.net/users/a',
    'https://a.b.baraag.net/users/a',
    'https://MEDIA.BARAAG.NET/users/a',
    'https://baraag.net:443/users/a',
    'https://media.baraag.net:8443/users/a',
  ])('matches %s', (uri) => {
    expect(matches(createSqliteD1Fixture(), uri)).toBe(1);
  });
  it.each([
    'https://notbaraag.net/users/a',
    'https://baraag.net.example/users/a',
    'https://example.com/baraag.net/users/a',
    'https://example.com/x.baraag.net/users/a',
    'https://evil.example/?u=.baraag.net/',
    'http://baraag.net/users/a',
    'https://baraag.net',
    'https://xbaraag.net/users/a',
    'baraag.net/users/a',
    'https://evilbaraag.net:443/users/a',
    'https://evil.example:443/x.baraag.net/users/a',
    'https://evil.example:443/?u=.baraag.net:443/',
    'https://baraag.net:443',
  ])('does not match %s', (uri) => {
    expect(matches(createSqliteD1Fixture(), uri)).toBe(0);
  });
});

describe('delete-blocked-domain-posts dry-run', () => {
  it('sends one SELECT statement and changes nothing', async () => {
    const { fixture } = build();
    const beforeRun = snapshot(fixture);
    const { queries, error } = await run('dry-run', fixture);
    expect(error).toBeUndefined();
    expect(queries).toEqual([dryRunSql()]);
    expect(queries[0]).toMatch(/^SELECT /);
    expect(queries[0]).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH)\b/i);
    expect(queries[0]).not.toContain(';');
    expect(snapshot(fixture)).toEqual(beforeRun);
  });
  it('counts the targets and the rows it leaves alone', async () => {
    const { fixture } = build();
    const { notices, error } = await run('dry-run', fixture);
    expect(error).toBeUndefined();
    expect(notices).toEqual([
      'IORI_NOTICE delete-blocked-domain-posts mode=dry-run domain=baraag.net posts=2 remote_posts=2 timeline_items=4 federated_items=2 reposts=2 likes=2 emoji_reacts=2 notifications=6 orphan_repost_notifications=0 images=2 articles_skipped=1 actors=2 follows_out=1 follows_in=1 mutes=1',
    ]);
  });
});

describe('delete-blocked-domain-posts dry-run counts', () => {
  it('counts the repost notifications that have no subtype row', async () => {
    const { fixture, seed, local } = build();
    for (const [type, createdAt] of [['repost', 20], ['repost', 21], ['like', 22]] as const) {
      fixture.sqlite.prepare(
        'INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) VALUES (?,?,?,?,?)',
      ).run(seed.uuid(), local.userId, type, 0, createdAt);
    }
    const { notices } = await run('dry-run', fixture);
    expect(notices[0]).toContain(' notifications=6 orphan_repost_notifications=2 ');
  });
  it('counts remote_posts by the same condition as the deletion', async () => {
    const { fixture, kept } = build();
    expect(count(fixture, 'remote_posts', `postId = '${kept.other.postId}'`)).toBe(1);
    const { notices } = await run('dry-run', fixture);
    expect(notices[0]).toContain(' posts=2 remote_posts=2 ');
  });
});

describe('delete-blocked-domain-posts apply on a SQLite fixture', () => {
  it('deletes the posts of the domain and its subdomains, and keeps every other post', async () => {
    const { fixture, bp1, bp2, article, kept, localPost } = build();
    const { error, notices } = await run('apply', fixture);
    expect(error).toBeUndefined();
    expect(column(fixture, 'SELECT postId FROM posts')).toEqual(
      ids(
        localPost.postId,
        article.postId,
        kept.notbaraag.postId,
        kept.example.postId,
        kept.pathy.postId,
        kept.other.postId,
        kept.mallory.postId,
      ),
    );
    for (const post of [bp1, bp2]) {
      expect(count(fixture, 'remote_posts', `postId = '${post.postId}'`)).toBe(0);
    }
    expect(count(fixture, 'remote_posts')).toBe(5);
    expect(notices).toEqual([
      'IORI_NOTICE delete-blocked-domain-posts mode=apply deleted_posts=2 deleted_timeline_items=4',
    ]);
  });
  it('does not fail with foreign keys enabled and leaves no dangling reference', async () => {
    const { fixture } = build();
    expect(rows(fixture, 'PRAGMA foreign_keys')[0]).toEqual({ foreign_keys: 1 });
    const { error } = await run('apply', fixture);
    expect(error).toBeUndefined();
    expect(rows(fixture, 'PRAGMA foreign_key_check')).toEqual([]);
  });
  it('soft-deletes the timeline items of the posts and keeps the others', async () => {
    const { fixture, bp1, bp2, article, kept, localPost, reposts } = build();
    await run('apply', fixture);
    expect(column(fixture, `SELECT timelineItemId FROM timeline_items WHERE deletedAt = ${now}`)).toEqual(
      ids(bp1.timelineItemId, bp2.timelineItemId, reposts.otherOfBp1.timelineItemId, reposts.subOfBp2.timelineItemId),
    );
    expect(count(fixture, 'timeline_items')).toBe(13);
    expect(count(fixture, 'timeline_items', 'deletedAt IS NULL')).toBe(9);
    expect(column(fixture, 'SELECT timelineItemId FROM timeline_items WHERE deletedAt IS NULL')).toEqual(
      ids(
        localPost.timelineItemId,
        article.timelineItemId,
        kept.notbaraag.timelineItemId,
        kept.example.timelineItemId,
        kept.pathy.timelineItemId,
        kept.other.timelineItemId,
        kept.mallory.timelineItemId,
        reposts.baraOfKept.timelineItemId,
        reposts.otherOfArticle.timelineItemId,
      ),
    );
  });
  it('deletes the notifications, subtype rows first, and keeps the others', async () => {
    const { fixture, notifications } = build();
    await run('apply', fixture);
    expect(column(fixture, 'SELECT notificationId FROM notifications')).toEqual(
      ids(
        notifications.likeOnKept,
        notifications.replyOnKept,
        notifications.mentionOnKept,
        notifications.likeOnArticle,
        notifications.follow,
      ),
    );
    expect(count(fixture, 'notification_likes')).toBe(2);
    expect(count(fixture, 'notification_emoji_reacts')).toBe(0);
    expect(count(fixture, 'notification_replies')).toBe(1);
    expect(count(fixture, 'notification_mentions')).toBe(1);
    expect(count(fixture, 'notification_reposts')).toBe(0);
    expect(count(fixture, 'notification_follows')).toBe(1);
  });
  it('deletes reposts, likes, emoji reacts, federated items, images and recipients of the posts only', async () => {
    const { fixture, reposts, keptLike, federated, imageIds, kept } = build();
    await run('apply', fixture);
    expect(column(fixture, 'SELECT repostId FROM reposts')).toEqual(
      ids(reposts.baraOfKept.repostId, reposts.otherOfArticle.repostId),
    );
    expect(column(fixture, 'SELECT likeId FROM likes')).toEqual(ids(keptLike.likeId));
    expect(count(fixture, 'local_likes')).toBe(0);
    expect(count(fixture, 'remote_likes')).toBe(0);
    expect(count(fixture, 'emoji_reacts')).toBe(1);
    expect(count(fixture, 'emoji_reacts', `postId = '${kept.notbaraag.postId}'`)).toBe(1);
    expect(column(fixture, 'SELECT federatedTimelineItemId FROM federated_timeline_items')).toEqual(
      ids(federated.kept, federated.article),
    );
    expect(column(fixture, 'SELECT imageId FROM post_images')).toEqual(ids(imageIds[2], imageIds[3]));
    expect(column(fixture, 'SELECT postId FROM remote_post_recipients')).toEqual(ids(kept.notbaraag.postId));
    expect(column(fixture, 'SELECT postId FROM post_quotes')).toEqual(ids(kept.notbaraag.postId));
    expect(count(fixture, 'link_previews')).toBe(0);
    expect(count(fixture, 'post_translations')).toBe(0);
  });
  it('deletes the participants of the direct posts of the domain without a foreign key violation, and keeps the others', async () => {
    const { fixture, seed, bara } = build();
    const notbaraag = seed.addRemoteActor('n9', 'notbaraag.net');
    const blockedDirect = seed.addRemotePost(bara, 150, { visibility: 'direct', timeline: false });
    const keptDirect = seed.addRemotePost(notbaraag, 151, { visibility: 'direct', timeline: false });
    const insert = fixture.sqlite.prepare('INSERT INTO direct_post_participants(postId,actorUri) VALUES (?,?)');
    insert.run(blockedDirect.postId, 'https://baraag.net/users/b1');
    insert.run(blockedDirect.postId, 'https://iori.test/users/alice');
    insert.run(keptDirect.postId, 'https://notbaraag.net/users/n1');
    insert.run(keptDirect.postId, 'https://iori.test/users/alice');
    await run('apply', fixture);
    expect(count(fixture, 'posts', `postId = '${blockedDirect.postId}'`)).toBe(0);
    expect(column(fixture, 'SELECT postId FROM direct_post_participants')).toEqual(
      ids(keptDirect.postId, keptDirect.postId),
    );
  });
  it('keeps the post that an article refers to, with everything attached to it', async () => {
    const { fixture, article, federated, reposts, notifications, imageIds } = build();
    await run('apply', fixture);
    expect(count(fixture, 'posts', `postId = '${article.postId}'`)).toBe(1);
    expect(count(fixture, 'remote_posts', `postId = '${article.postId}'`)).toBe(1);
    expect(count(fixture, 'timeline_items', `postId = '${article.postId}' AND deletedAt IS NULL`)).toBe(2);
    expect(count(fixture, 'federated_timeline_items', `federatedTimelineItemId = '${federated.article}'`)).toBe(1);
    expect(count(fixture, 'reposts', `repostId = '${reposts.otherOfArticle.repostId}'`)).toBe(1);
    expect(count(fixture, 'notifications', `notificationId = '${notifications.likeOnArticle}'`)).toBe(1);
    expect(count(fixture, 'post_images', `imageId = '${imageIds[3]}'`)).toBe(1);
    expect(count(fixture, 'articles')).toBe(1);
  });
  it('keeps the actors, the follows and the mutes', async () => {
    const { fixture } = build();
    const tables = ['actors', 'remote_actors', 'local_actors', 'follows', 'mutes', 'users'];
    const state = () => Object.fromEntries(tables.map((table) => [table, rows(fixture, `SELECT * FROM ${table}`)]));
    const beforeRun = state();
    await run('apply', fixture);
    expect(state()).toEqual(beforeRun);
  });
  it('deletes the posts of an actor whose URI carries a port', async () => {
    const { fixture, seed } = build();
    const ported = seed.addRemoteActor('p1', 'baraag.net:8443');
    const post = seed.addRemotePost(ported, 140, { timeline: true });
    const { notices } = await run('apply', fixture);
    expect(count(fixture, 'posts', `postId = '${post.postId}'`)).toBe(0);
    expect(count(fixture, 'remote_posts', `postId = '${post.postId}'`)).toBe(0);
    expect(notices).toEqual([
      'IORI_NOTICE delete-blocked-domain-posts mode=apply deleted_posts=3 deleted_timeline_items=5',
    ]);
  });
  it('never targets a local actor even when its URI is on the domain', async () => {
    const { fixture, kept } = build();
    expect(count(fixture, 'actors', 'uri = \'https://baraag.net/users/mallory\'')).toBe(1);
    await run('apply', fixture);
    expect(count(fixture, 'posts', `postId = '${kept.mallory.postId}'`)).toBe(1);
    expect(count(fixture, 'local_posts', `postId = '${kept.mallory.postId}'`)).toBe(1);
  });
});

describe('delete-blocked-domain-posts domain events', () => {
  const at = Instant.orThrow(now);
  const eventRow = (event: {
    aggregateId: unknown;
    aggregateName: string;
    eventName: string;
    eventPayload: unknown;
    occurredAt: number;
  }) => ({
    aggregateId: typeof event.aggregateId === 'string' ? event.aggregateId : JSON.stringify(event.aggregateId),
    aggregateName: event.aggregateName,
    aggregateState: null,
    eventName: event.eventName,
    eventPayload: JSON.stringify(event.eventPayload),
    occurredAt: event.occurredAt,
    occurredType: 'integer',
    stateType: 'null',
  });
  const sorted = (items: Array<Record<string, unknown>>) =>
    [...items].sort((a, b) => `${a.eventName}${a.aggregateId}`.localeCompare(`${b.eventName}${b.aggregateId}`));

  it('writes the events in the shape the domain factories and the D1 stores write', async () => {
    const built = build();
    const { fixture, bp1, bp2, reposts, localLike, remoteLikeId, federated, notifications, other } = built;
    const emojiIds = column(fixture, 'SELECT emojiReactId FROM emoji_reacts WHERE emoji IN (\':a:\', \':b:\')');
    const emojiUris = new Map(
      rows(fixture, 'SELECT emojiReactId, emojiReactActivityUri FROM emoji_reacts').map((
        row,
      ) => [String(row.emojiReactId), row.emojiReactActivityUri as string | null]),
    );
    await run('apply', fixture);

    const cast = <T>(value: unknown) => value as T;
    const expected = [
      ...[bp1.timelineItemId, bp2.timelineItemId, reposts.otherOfBp1.timelineItemId, reposts.subOfBp2.timelineItemId]
        .map((id) => TimelineItem.deleteTimelineItem(cast(id), at)),
      Notification.deleteLikeNotification(
        cast({ notificationId: notifications.likeOnBp1, likerActorId: other.actorId, likedPostId: bp1.postId }),
        at,
      ),
      Notification.deleteEmojiReactNotification(
        cast({
          notificationId: notifications.emojiOnBp1,
          reactorActorId: other.actorId,
          reactedPostId: bp1.postId,
          emoji: ':wave:',
        }),
        at,
      ),
      Notification.deleteReplyNotification(
        cast({
          notificationId: notifications.replyFromBp2,
          replierActorId: built.sub.actorId,
          replyPostId: bp2.postId,
          originalPostId: built.localPost.postId,
        }),
        at,
      ),
      Notification.deleteReplyNotification(
        cast({
          notificationId: notifications.replyToBp1,
          replierActorId: other.actorId,
          replyPostId: built.kept.other.postId,
          originalPostId: bp1.postId,
        }),
        at,
      ),
      Notification.deleteMentionNotification(
        cast({
          notificationId: notifications.mentionOnBp1,
          mentionerActorId: other.actorId,
          mentionPostId: bp1.postId,
        }),
        at,
      ),
      ...[reposts.otherOfBp1, reposts.subOfBp2].map((repost) => Repost.deleteRepost(cast(repost), at)),
      Like.deleteLocalLike(cast({ likeId: localLike.likeId }), at),
      Like.deleteRemoteLike(cast({ likeId: remoteLikeId, likeActivityUri: 'https://remote.example/likes/1' }), at),
      ...emojiIds.map((emojiReactId) =>
        EmojiReact.deleteEmojiReact(
          cast({ emojiReactId, emojiReactActivityUri: emojiUris.get(emojiReactId) ?? null }),
          at,
        )
      ),
      ...[federated.bp1, federated.bp2].map((id) => FederatedTimelineItem.deleteFederatedTimelineItem(cast(id), at)),
      ...[bp1.postId, bp2.postId].map((postId) => Post.deletePost(at)(cast(postId))),
    ];
    expect(sorted(eventRows(fixture))).toEqual(sorted(expected.map(eventRow)));
  });
  it('writes no event for a repost notification, which the domain has no deleted event for', async () => {
    const { fixture, notifications } = build();
    await run('apply', fixture);
    expect(count(fixture, 'domain_events', `aggregateId LIKE '%${notifications.repostOfBp2}%'`)).toBe(0);
    expect(count(fixture, 'domain_events', 'eventName LIKE \'notification.repost%\'')).toBe(0);
  });
  it('writes a scalar aggregate ID and a null state for post.deleted, like the post store', async () => {
    const { fixture, bp1 } = build();
    await run('apply', fixture);
    const [event] = rows(
      fixture,
      `SELECT aggregateId, aggregateName, aggregateState, eventPayload, occurredAt FROM domain_events WHERE eventName = 'post.deleted' AND aggregateId = '${bp1.postId}'`,
    );
    expect(event).toEqual({
      aggregateId: bp1.postId,
      aggregateName: 'post',
      aggregateState: null,
      eventPayload: JSON.stringify({ postId: bp1.postId, deletedAt: now }),
      occurredAt: now,
    });
  });
});

describe('delete-blocked-domain-posts re-runs', () => {
  it('does not change anything when it runs a second time', async () => {
    const { fixture } = build();
    await run('apply', fixture);
    const afterFirst = snapshot(fixture);
    const second = await run('apply', fixture, {}, { at: now + 1 });
    expect(second.error).toBeUndefined();
    expect(snapshot(fixture)).toEqual(afterFirst);
    expect(second.notices).toEqual([
      'IORI_NOTICE delete-blocked-domain-posts mode=apply deleted_posts=0 deleted_timeline_items=0',
    ]);
  });
  const statementCount = applySql({ now }).length;
  it.each(Array.from({ length: statementCount - 1 }, (_, index) => index + 1))(
    'ends in the same state when it runs again after only the first %i statements',
    (done) => {
      const complete = build();
      for (const sql of applySql({ now })) complete.fixture.sqlite.exec(sql);
      const partial = build();
      const statements = applySql({ now });
      for (const sql of statements.slice(0, done)) partial.fixture.sqlite.exec(sql);
      for (const sql of statements) partial.fixture.sqlite.exec(sql);
      expect(snapshot(partial.fixture)).toEqual(snapshot(complete.fixture));
      expect(rows(partial.fixture, 'PRAGMA foreign_key_check')).toEqual([]);
    },
  );
  it('finishes through the operation after the posts were half deleted', async () => {
    const complete = build();
    await run('apply', complete.fixture);
    const partial = build();
    const statements = applySql({ now });
    const stopAfter = statements.findIndex((sql) => sql.startsWith('DELETE FROM remote_posts')) + 1;
    for (const sql of statements.slice(0, stopAfter)) partial.fixture.sqlite.exec(sql);
    expect(count(partial.fixture, 'remote_posts', `postId = '${partial.bp1.postId}'`)).toBe(0);
    expect(count(partial.fixture, 'posts', `postId = '${partial.bp1.postId}'`)).toBe(1);
    const resumed = await run('apply', partial.fixture);
    expect(resumed.error).toBeUndefined();
    expect(snapshot(partial.fixture)).toEqual(snapshot(complete.fixture));
  });
  it('fails with the query stage and prints no notice when the apply request is rejected', async () => {
    const { fixture } = build();
    const { fetchRequest } = fakeFetch(fixture);
    const rejected =
      (async (url: URL, init: RequestInit) =>
        init.body !== undefined && String(init.body).includes('INSERT INTO')
          ? json(null, 500)
          : fetchRequest(url, init)) as typeof fetch;
    const notices: string[] = [];
    let error: unknown;
    try {
      await deleteBlockedDomainPosts({
        env: env(),
        mode: 'apply',
        fetchRequest: rejected,
        notice: (line) => notices.push(line),
        now,
      });
    } catch (caught) {
      error = caught;
    }
    expect(notices).toEqual([]);
    expect(deleteFailureLines(error)).toEqual([diag('delete-posts-query', 'd1-http-500')]);
    expect(count(fixture, 'posts')).toBe(9);
  });
});
