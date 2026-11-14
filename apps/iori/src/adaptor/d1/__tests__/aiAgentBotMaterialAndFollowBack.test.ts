import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import {
  createD1AiAgentBotFollowBackAttemptedStore,
  createD1AiAgentBotFollowBackCandidatesResolver,
} from '../aiAgentBot/aiAgentBotFollowBackAdapters.ts';
import { createD1PopularArticlesResolverByFetchedSince } from '../feedEntry/popularArticlesResolverByFetchedSince.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 14, 12));

describe('AI エージェントの bot のフォローバックの D1 アダプタ', () => {
  const setup = () => {
    const fixture = createSqliteD1Fixture();
    const seed = createMastodonSeed(fixture);
    const bot = seed.addLocalActor('agent');
    const botActorId = ActorId.orThrow(bot.actorId);
    const resolve = async (retryBefore: Instant) =>
      (await createD1AiAgentBotFollowBackCandidatesResolver(fixture.db).resolve({ botActorId, retryBefore, limit: 10 }))
        .val;
    return { seed, bot, resolve, attempted: createD1AiAgentBotFollowBackAttemptedStore(fixture.db) };
  };

  it('bot をフォローしていて、bot がまだフォローしていない人を、フォローしてくれた順に返す', async () => {
    const { seed, bot, resolve } = setup();
    const alice = seed.addRemoteActor('alice');
    const bob = seed.addRemoteActor('bob');
    const mutual = seed.addRemoteActor('mutual');
    const followedOnly = seed.addRemoteActor('followed');
    seed.addFollow(alice.actorId, bot.actorId);
    seed.addFollow(mutual.actorId, bot.actorId);
    seed.addFollow(bot.actorId, mutual.actorId);
    seed.addFollow(bob.actorId, bot.actorId);
    seed.addFollow(bot.actorId, followedOnly.actorId);

    expect(await resolve(NOW)).toEqual([alice.actorId, bob.actorId]);
  });

  it('最近フォローを返そうとした人は、間隔をあけるまで選ばない', async () => {
    const { seed, bot, resolve, attempted } = setup();
    const alice = seed.addRemoteActor('alice');
    seed.addFollow(alice.actorId, bot.actorId);
    await attempted.store({ actorId: ActorId.orThrow(alice.actorId), attemptedAt: NOW });

    expect(await resolve(Instant.addDuration(NOW, -DAY_MS))).toEqual([]);
    expect(await resolve(Instant.addDuration(NOW, DAY_MS))).toEqual([alice.actorId]);
  });
});

describe('createD1PopularArticlesResolverByFetchedSince', () => {
  it('最近集めた記事を、はてなブックマークの多い順に、同じ URL を 1 件にまとめて返す', async () => {
    const { sqlite, db } = createSqliteD1Fixture();
    const addSource = (id: string, kind: string, title: string, enabled = 1) =>
      sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
        .run(id, kind, `https://feeds.example/${id}`, title, enabled, 1);
    let n = 0;
    const addEntry = (sourceId: string, url: string, count: number | null, fetchedAt: number) =>
      sqlite.prepare(
        'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,hatenaBookmarkCount,fetchedAt) VALUES (?,?,?,?,?,?,?,?)',
      ).run(
        `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
        sourceId,
        `g${n}`,
        url,
        url,
        '',
        count,
        fetchedAt,
      );
    addSource('rss', 'rss', 'Tech Blog');
    addSource('hot', 'hatena_hotentry', 'はてなブックマーク');
    addSource('x', 'x_user', '@someone');
    addSource('off', 'rss', 'Disabled', 0);
    addEntry('rss', 'https://example.com/a', 120, NOW);
    addEntry('hot', 'https://example.com/a', 150, NOW);
    addEntry('hot', 'https://example.com/b', 300, NOW);
    addEntry('rss', 'https://example.com/old', 999, NOW - 3 * DAY_MS);
    addEntry('rss', 'https://example.com/none', null, NOW);
    addEntry('x', 'https://x.com/someone/status/1', 5000, NOW);
    addEntry('off', 'https://example.com/off', 5000, NOW);

    const articles = await createD1PopularArticlesResolverByFetchedSince(db).resolve({
      fetchedSince: Instant.addDuration(NOW, -2 * DAY_MS),
      limit: 10,
    });

    expect(articles.val.map((article) => [article.url, article.bookmarkCount])).toEqual([
      ['https://example.com/b', 300],
      ['https://example.com/a', 150],
    ]);
  });
});
