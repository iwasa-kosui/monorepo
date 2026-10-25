import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Article } from '../../../domain/article/article.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Mute } from '../../../domain/mute/mute.ts';
import { MuteId } from '../../../domain/mute/muteId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { Relay } from '../../../domain/relay/relay.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1ArticleCreatedStore } from '../article/articleCreatedStore.ts';
import { createD1ArticleDeletedStore } from '../article/articleDeletedStore.ts';
import { createD1ArticlePublishedStore } from '../article/articlePublishedStore.ts';
import { createD1ArticleResolverByRootPostId } from '../article/articleResolverByRootPostId.ts';
import { createD1ArticlesResolverByAuthorActorId } from '../article/articlesResolverByAuthorActorId.ts';
import { createD1ArticleUnpublishedStore } from '../article/articleUnpublishedStore.ts';
import { createD1PublishedArticlesWithAuthorResolver } from '../article/publishedArticlesWithAuthorResolver.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1MuteCreatedStore } from '../mute/muteCreatedStore.ts';
import { createD1MuteDeletedStore } from '../mute/muteDeletedStore.ts';
import { createD1MuteResolver } from '../mute/muteResolver.ts';
import { createD1MutesResolverByUserId } from '../mute/mutesResolverByUserId.ts';
import { createD1AllRelaysResolver } from '../relay/allRelaysResolver.ts';
import { createD1RelayResolver } from '../relay/relayResolver.ts';
import { createD1RelaySubscriptionRequestedStore } from '../relay/relaySubscriptionRequestedStore.ts';
import { createD1RelayUnsubscribedStore } from '../relay/relayUnsubscribedStore.ts';

const queryDb = (results: unknown[][]): IoriD1Db => ({
  select: () => {
    const rows = results.shift() ?? [];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: () => builder,
      limit: () => builder,
      orderBy: () => builder,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return builder;
  },
} as unknown as IoriD1Db);

const recordingDb = () => {
  const batches: unknown[][] = [];
  const db = {
    insert: (table: unknown) => ({ values: (values: unknown) => ({ kind: 'insert', table, values }) }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({ where: () => ({ kind: 'update', table, values }) }),
    }),
    delete: (table: unknown) => ({ where: () => ({ kind: 'delete', table }) }),
    batch: async (items: unknown[]) => batches.push(items),
  } as unknown as IoriD1Db;
  return { db, batches } as const;
};

describe('D1 article, mute, and relay adapters', () => {
  it('reconstructs article listings, mutes, and relays', async () => {
    const actorId = ActorId.generate();
    const userId = UserId.generate();
    const rootPostId = PostId.generate();
    const now = new Date('2026-08-05T00:00:00.000Z');
    const articleRow = {
      articleId: crypto.randomUUID(),
      authorActorId: actorId,
      authorUserId: userId,
      rootPostId,
      title: 'D1 article',
      status: 'draft',
      createdAt: now,
      publishedAt: null,
      unpublishedAt: null,
    };
    const muteRow = { muteId: MuteId.generate(), userId, mutedActorId: actorId, createdAt: now };
    const relayRow = {
      relayId: RelayId.generate(),
      inboxUrl: 'https://relay.test/inbox',
      actorUri: 'https://relay.test/actor',
      status: 'pending',
      createdAt: now,
      acceptedAt: null,
    };

    const byRoot = await createD1ArticleResolverByRootPostId(queryDb([[articleRow]])).resolve({ rootPostId });
    const byAuthor = await createD1ArticlesResolverByAuthorActorId(queryDb([[articleRow]])).resolve({ actorId });
    const published = await createD1PublishedArticlesWithAuthorResolver(queryDb([[
      { article: { ...articleRow, status: 'published' }, username: 'kosui' },
    ]])).resolve();
    const mute = await createD1MuteResolver(queryDb([[muteRow]])).resolve({ userId, mutedActorId: actorId });
    const mutes = await createD1MutesResolverByUserId(queryDb([[muteRow]])).resolve(userId);
    const relay = await createD1RelayResolver(queryDb([[relayRow]])).resolve({ relayId: relayRow.relayId });
    const relays = await createD1AllRelaysResolver(queryDb([[relayRow]])).resolve();

    expect(byRoot).toMatchObject({ ok: true, val: { rootPostId } });
    expect(byAuthor).toMatchObject({ ok: true, val: [{ title: 'D1 article' }] });
    expect(published).toMatchObject({
      ok: true,
      val: { authorUsername: 'kosui', articles: [{ status: 'published' }] },
    });
    expect(mute).toMatchObject({ ok: true, val: { mutedActorId: actorId } });
    expect(mutes).toMatchObject({ ok: true, val: [{ mutedActorId: actorId }] });
    expect(relay).toMatchObject({ ok: true, val: { actorUri: relayRow.actorUri } });
    expect(relays).toMatchObject({ ok: true, val: [{ relayId: relayRow.relayId }] });
  });

  it('batches state changes with domain events for articles, mutes, and relays', async () => {
    const { db, batches } = recordingDb();
    const now = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));
    const actorId = ActorId.generate();
    const userId = UserId.generate();
    const articleCreated = Article.createArticle(now)({
      authorActorId: actorId,
      authorUserId: userId,
      rootPostId: PostId.generate(),
      title: 'D1 article',
    });
    const articlePublished = Article.publishArticle(now)(articleCreated.aggregateState);
    const articleUnpublished = Article.unpublishArticle(now)(articlePublished.aggregateState);
    const articleDeleted = Article.deleteArticle(now)(articleCreated.aggregateState.articleId);
    const muteCreated = Mute.createMute({
      muteId: MuteId.generate(),
      userId,
      mutedActorId: actorId,
    }, now);
    const muteDeleted = Mute.deleteMute(muteCreated.aggregateState, now);
    const relayRequested = Relay.requestSubscription({
      relayId: RelayId.generate(),
      inboxUrl: 'https://relay.test/inbox',
      actorUri: 'https://relay.test/actor',
      createdAt: now,
    }, now);
    const relayUnsubscribed = Relay.unsubscribe(relayRequested.aggregateState, now);

    await createD1ArticleCreatedStore(db).store(articleCreated);
    await createD1ArticlePublishedStore(db).store(articlePublished);
    await createD1ArticleUnpublishedStore(db).store(articleUnpublished);
    await createD1ArticleDeletedStore(db).store(articleDeleted);
    await createD1MuteCreatedStore(db).store(muteCreated);
    await createD1MuteDeletedStore(db).store(muteDeleted);
    await createD1RelaySubscriptionRequestedStore(db).store(relayRequested);
    await createD1RelayUnsubscribedStore(db).store(relayUnsubscribed);

    expect(batches).toHaveLength(8);
    expect(batches.every((statements) => statements.length >= 2)).toBe(true);
  });
});
