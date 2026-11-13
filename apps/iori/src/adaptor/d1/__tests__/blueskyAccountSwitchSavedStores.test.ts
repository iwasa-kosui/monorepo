import { Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { createD1BlueskyAccountSwitchPurger } from '../blueskyAccountSwitch/blueskyAccountSwitchPurger.ts';
import { createD1BlueskyBookmarkSavedStore } from '../blueskyTimeline/blueskyBookmarkSavedStore.ts';
import { createD1BlueskyLikeSavedStore } from '../blueskyTimeline/blueskyLikeSavedStore.ts';
import { createD1BlueskyRepostSavedStore } from '../blueskyTimeline/blueskyRepostSavedStore.ts';
import { insertBlueskyAccountSwitch } from './blueskyAccountSwitchFixture.ts';
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
  sqlite.prepare('INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)')
    .run(SUBJECT, 'at://did:plc:old/app.bsky.feed.like/1', BEFORE);
  sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)')
    .run(SUBJECT, 'at://did:plc:old/app.bsky.feed.repost/1', BEFORE);
  sqlite.prepare('INSERT INTO bluesky_bookmarks(subjectUri,createdAt) VALUES (?,?)').run(SUBJECT, BEFORE);
  insertBlueskyAccountSwitch(sqlite, { startedAt: STARTED_AT });
  return { db, sqlite, purger: createD1BlueskyAccountSwitchPurger(db) };
};

describe('切り替え中に、前のアカウントの行と同じ subjectUri へ新しいアカウントで保存する', () => {
  it('いいねは、likeUri と createdAt を新しい値にし、削除の後も残る', async () => {
    const t = setup();
    const likeUri = 'at://did:plc:new/app.bsky.feed.like/1';

    await createD1BlueskyLikeSavedStore(t.db).save({ subjectUri: SUBJECT, likeUri, createdAt: AFTER });
    Result.unsafeUnwrap(await t.purger.purge('likes', STARTED_AT));

    expect(t.sqlite.prepare('SELECT subjectUri, likeUri, createdAt FROM bluesky_likes').all()).toEqual([
      { subjectUri: SUBJECT, likeUri, createdAt: AFTER },
    ]);
  });

  it('リポストは、repostUri と createdAt を新しい値にし、削除の後も残る', async () => {
    const t = setup();
    const repostUri = 'at://did:plc:new/app.bsky.feed.repost/1';

    await createD1BlueskyRepostSavedStore(t.db).save({ subjectUri: SUBJECT, repostUri, createdAt: AFTER });
    Result.unsafeUnwrap(await t.purger.purge('reposts', STARTED_AT));

    expect(t.sqlite.prepare('SELECT subjectUri, repostUri, createdAt FROM bluesky_reposts').all()).toEqual([
      { subjectUri: SUBJECT, repostUri, createdAt: AFTER },
    ]);
  });

  it('ブックマークは、createdAt を新しい値にし、削除の後も残る', async () => {
    const t = setup();

    await createD1BlueskyBookmarkSavedStore(t.db).save({ subjectUri: SUBJECT, createdAt: AFTER });
    Result.unsafeUnwrap(await t.purger.purge('bookmarks', STARTED_AT));

    expect(t.sqlite.prepare('SELECT subjectUri, createdAt FROM bluesky_bookmarks').all()).toEqual([
      { subjectUri: SUBJECT, createdAt: AFTER },
    ]);
  });
});
