import { Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1BlueskyAccountSwitchPurger } from '../blueskyAccountSwitch/blueskyAccountSwitchPurger.ts';
import { createD1BlueskyBookmarkSavedStore } from '../blueskyTimeline/blueskyBookmarkSavedStore.ts';
import { createD1BlueskyLikeSavedStore } from '../blueskyTimeline/blueskyLikeSavedStore.ts';
import { createD1BlueskyRepostSavedStore } from '../blueskyTimeline/blueskyRepostSavedStore.ts';
import { countBlueskyData, insertBlueskyAccountSwitch, seedBlueskyData } from './blueskyAccountSwitchFixture.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const STARTED_AT = Instant.orThrow(1_800_000_000_000);
const BEFORE = Instant.orThrow(STARTED_AT - 1_000);
const AFTER = Instant.orThrow(STARTED_AT + 1_000);
const SUBJECT = 'at://did:plc:a/app.bsky.feed.post/1';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db, sqlite } = fixture;
  const seed = createMastodonSeed(fixture);
  const userId = UserId.orThrow(seed.addLocalActor('alice').userId);
  const other = UserId.orThrow(seed.addLocalActor('bob').userId);
  sqlite.prepare('INSERT INTO bluesky_likes(userId,subjectUri,likeUri,createdAt) VALUES (?,?,?,?)')
    .run(userId, SUBJECT, 'at://did:plc:old/app.bsky.feed.like/1', BEFORE);
  sqlite.prepare('INSERT INTO bluesky_reposts(userId,subjectUri,repostUri,createdAt) VALUES (?,?,?,?)')
    .run(userId, SUBJECT, 'at://did:plc:old/app.bsky.feed.repost/1', BEFORE);
  sqlite.prepare('INSERT INTO bluesky_bookmarks(userId,subjectUri,createdAt) VALUES (?,?,?)').run(
    userId,
    SUBJECT,
    BEFORE,
  );
  insertBlueskyAccountSwitch(sqlite, userId, { startedAt: STARTED_AT });
  return { db, sqlite, userId, other, purger: createD1BlueskyAccountSwitchPurger(db, userId) };
};

describe('切り替え中に、前のアカウントの行と同じ subjectUri へ新しいアカウントで保存する', () => {
  it('いいねは、likeUri と createdAt を新しい値にし、削除の後も残る', async () => {
    const t = setup();
    const likeUri = 'at://did:plc:new/app.bsky.feed.like/1';

    await createD1BlueskyLikeSavedStore(t.db, t.userId).save({ subjectUri: SUBJECT, likeUri, createdAt: AFTER });
    Result.unsafeUnwrap(await t.purger.purge('likes', STARTED_AT));

    expect(t.sqlite.prepare('SELECT subjectUri, likeUri, createdAt FROM bluesky_likes').all()).toEqual([
      { subjectUri: SUBJECT, likeUri, createdAt: AFTER },
    ]);
  });

  it('リポストは、repostUri と createdAt を新しい値にし、削除の後も残る', async () => {
    const t = setup();
    const repostUri = 'at://did:plc:new/app.bsky.feed.repost/1';

    await createD1BlueskyRepostSavedStore(t.db, t.userId).save({ subjectUri: SUBJECT, repostUri, createdAt: AFTER });
    Result.unsafeUnwrap(await t.purger.purge('reposts', STARTED_AT));

    expect(t.sqlite.prepare('SELECT subjectUri, repostUri, createdAt FROM bluesky_reposts').all()).toEqual([
      { subjectUri: SUBJECT, repostUri, createdAt: AFTER },
    ]);
  });

  it('ブックマークは、createdAt を新しい値にし、削除の後も残る', async () => {
    const t = setup();

    await createD1BlueskyBookmarkSavedStore(t.db, t.userId).save({ subjectUri: SUBJECT, createdAt: AFTER });
    Result.unsafeUnwrap(await t.purger.purge('bookmarks', STARTED_AT));

    expect(t.sqlite.prepare('SELECT subjectUri, createdAt FROM bluesky_bookmarks').all()).toEqual([
      { subjectUri: SUBJECT, createdAt: AFTER },
    ]);
  });
});

describe('切り替え中のユーザーの行だけを消す', () => {
  it('同じ subjectUri の行でも、別のユーザーのものは消さない', async () => {
    const t = setup();
    t.sqlite.prepare('INSERT INTO bluesky_likes(userId,subjectUri,likeUri,createdAt) VALUES (?,?,?,?)')
      .run(t.other, SUBJECT, 'at://did:plc:bob/app.bsky.feed.like/1', BEFORE);

    Result.unsafeUnwrap(await t.purger.purge('likes', STARTED_AT));

    expect(t.sqlite.prepare('SELECT userId FROM bluesky_likes').all()).toEqual([{ userId: t.other }]);
  });

  it('期限で絞らない表（タイムラインなど）も、別のユーザーの行は残す', async () => {
    const t = setup();
    seedBlueskyData(t.sqlite, t.userId, { timelineItems: 3, notificationReceipts: 2, chatPushReceipts: 1 });
    seedBlueskyData(t.sqlite, t.other, { timelineItems: 2, notificationReceipts: 1, chatPushReceipts: 1 });

    for (const target of ['timelineItems', 'notificationReceipts', 'chatPushReceipts'] as const) {
      Result.unsafeUnwrap(await t.purger.purge(target, STARTED_AT));
    }

    expect(countBlueskyData(t.sqlite, t.userId)).toMatchObject({
      timelineItems: 0,
      notificationReceipts: 0,
      chatPushReceipts: 0,
    });
    expect(countBlueskyData(t.sqlite, t.other)).toMatchObject({
      timelineItems: 2,
      notificationReceipts: 1,
      chatPushReceipts: 1,
    });
  });
});
