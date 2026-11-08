import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom } from '../src/adaptor/d1/digest/digestTopicItemsResolverByUserIdAndDigestDateFrom.ts';
import { createD1RecommendableArticlesResolverByFetchedSince } from '../src/adaptor/d1/recommendation/recommendableArticlesResolverByFetchedSince.ts';
import { Instant } from '../src/domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../src/domain/interestSource/embedding.ts';
import { float32ToBytes } from '../src/domain/interestSource/embeddingBytes.ts';
import { UserId } from '../src/domain/user/userId.ts';

const db = createD1Db(env.DB);
const USER_ID = UserId.orThrow('00000000-0000-4000-8000-0000000000a1');
const OTHER_USER_ID = UserId.orThrow('00000000-0000-4000-8000-0000000000a2');
const ACTOR_IDS = {
  [USER_ID]: '00000000-0000-4000-8000-0000000000d1',
  [OTHER_USER_ID]: '00000000-0000-4000-8000-0000000000d2',
};
const SOURCE_ID = '00000000-0000-4000-8000-0000000000b1';
const ENTRY_ID = '00000000-0000-4000-8000-0000000000c1';
const FETCHED_AT = Date.UTC(2020, 0, 5);
const embedding = float32ToBytes(Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0)));
const userIds = [USER_ID, OTHER_USER_ID];

const addDigest = async (userId: UserId, digestDate: string, topicKey: string) => {
  const digestId = crypto.randomUUID();
  const articleId = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).bind(articleId, ACTOR_IDS[userId], userId, null, 'title', 'draft', 1_000, null, null).run();
  await env.DB.prepare(
    'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,topicKey) VALUES (?,?,?,?,?,?,?)',
  ).bind(digestId, userId, digestDate, articleId, 2_000, null, topicKey).run();
  await env.DB.prepare(
    'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,score,summary,reasonInterestSourceId,feedback) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).bind(crypto.randomUUID(), digestId, ENTRY_ID, 'https://example.com/a', 'A', 1, null, null, null, 'interested')
    .run();
};

const clean = () =>
  env.DB.batch([
    env.DB.prepare(
      `DELETE FROM digest_items WHERE digestId IN (SELECT digestId FROM digests WHERE userId IN (?, ?))`,
    ).bind(...userIds),
    env.DB.prepare('DELETE FROM digests WHERE userId IN (?, ?)').bind(...userIds),
    env.DB.prepare('DELETE FROM articles WHERE authorUserId IN (?, ?)').bind(...userIds),
    env.DB.prepare('DELETE FROM local_actors WHERE userId IN (?, ?)').bind(...userIds),
    env.DB.prepare('DELETE FROM actors WHERE actorId IN (?, ?)').bind(...Object.values(ACTOR_IDS)),
    env.DB.prepare('DELETE FROM users WHERE userId IN (?, ?)').bind(...userIds),
    env.DB.prepare('DELETE FROM feed_entries WHERE feedEntryId = ?').bind(ENTRY_ID),
    env.DB.prepare('DELETE FROM feed_sources WHERE feedSourceId = ?').bind(SOURCE_ID),
  ]);

beforeEach(async () => {
  await clean();
  await env.DB.batch([
    ...userIds.flatMap((userId, index) => [
      env.DB.prepare('INSERT INTO users(userId,username) VALUES (?,?)').bind(userId, `preview-user-${index}`),
      env.DB.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').bind(
        ACTOR_IDS[userId],
        `https://iori.test/users/preview-user-${index}`,
        `https://iori.test/users/preview-user-${index}/inbox`,
        'local',
      ),
      env.DB.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').bind(ACTOR_IDS[userId], userId),
    ]),
    env.DB.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .bind(SOURCE_ID, 'rss', 'https://feeds.example/preview', 'rss', 1, 1_000),
    env.DB.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,hatenaBookmarkCount,fetchedAt,embedding,embeddedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).bind(ENTRY_ID, SOURCE_ID, 'guid', 'https://example.com/a', 'A', '', null, FETCHED_AT, embedding, 2_000),
  ]);
});

describe('preview resolvers on workerd D1', () => {
  it('ダイジェスト項目を自分の分だけ、記事の embedding つきで返す', async () => {
    await addDigest(USER_ID, '2020-01-05', 'genai');
    await addDigest(USER_ID, '2020-01-05', 'summary');
    await addDigest(USER_ID, '2020-01-01', 'genai');
    await addDigest(OTHER_USER_ID, '2020-01-05', 'genai');

    const resolved = await createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom(db).resolve({
      userId: USER_ID,
      digestDateFrom: '2020-01-04',
    });

    expect(resolved.val).toHaveLength(1);
    expect(resolved.val[0]).toMatchObject({
      digestDate: '2020-01-05',
      topicKey: 'genai',
      rank: 1,
      title: 'A',
      feedback: 'interested',
    });
    expect(resolved.val[0]!.embedding?.[0]).toBe(1);
  });

  it('候補記事に fetchedAt を付けて返す', async () => {
    const resolved = await createD1RecommendableArticlesResolverByFetchedSince(db).resolve({
      fetchedSince: Instant.orThrow(FETCHED_AT),
    });

    expect(resolved.val.filter((article) => article.feedEntryId === ENTRY_ID).map((article) => article.fetchedAt))
      .toEqual([FETCHED_AT]);
  });
});
