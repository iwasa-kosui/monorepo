import { afterEach, describe, expect, it } from 'vitest';

import type { Notification } from '../../../domain/notification/notification.ts';
import type { PageRequest } from '../../../domain/page/page.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1NotificationCountResolverSinceMarker } from '../notification/notificationCountResolverSinceMarker.ts';
import { createD1NotificationsResolverByPage } from '../notification/notificationsResolverByPage.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const BLOCK = 'at://did:plc:me/app.bsky.graph.block/3kblock';
const types: Notification['type'][] = ['like', 'blueskyLike', 'blueskyFollow', 'blueskyMention'];
const page: PageRequest = { limit: 20, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' };

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const alice = seed.addRemoteActor('alice');
  const myPost = seed.addLocalPost(me, 1_000);
  const ids = {
    fediverseLike: seed.addLikeNotification(me.userId, alice.actorId, myPost.postId, 2_000),
    blueskyLike: seed.addBlueskyNotification(me.userId, 'blueskyLike', 3_000),
    blueskyFollow: seed.addBlueskyNotification(me.userId, 'blueskyFollow', 4_000),
    blueskyMention: seed.addBlueskyNotification(me.userId, 'blueskyMention', 5_000, {
      reason: 'reply',
      subjectUri: null,
      text: 'hello',
    }),
  };
  const moderate = (muted: number, blockUri: string | null) =>
    fixture.sqlite.prepare('INSERT INTO bluesky_moderated_actors(did,muted,blockUri,updatedAt) VALUES (?,?,?,?)')
      .run('did:plc:alice', muted, blockUri, 1);
  const listed = async () => {
    const result = await createD1NotificationsResolverByPage(fixture.db).resolve({
      recipientUserId: UserId.orThrow(me.userId),
      page,
      types,
    });
    return result.ok ? result.val.map((item) => item.notification.notificationId as string) : undefined;
  };
  const unread = async (limit = 100) => {
    const result = await createD1NotificationCountResolverSinceMarker(fixture.db).resolve({
      userId: UserId.orThrow(me.userId),
      types,
      limit,
    });
    return result.ok ? result.val : undefined;
  };
  return { ...fixture, seed, me, ids, moderate, listed, unread };
};

describe('ミュートとブロックの通知の除外', () => {
  it('対象の DID が無ければ、一覧も未読数もすべて返す', async () => {
    const t = setup();

    expect(await t.listed()).toEqual([
      t.ids.blueskyMention,
      t.ids.blueskyFollow,
      t.ids.blueskyLike,
      t.ids.fediverseLike,
    ]);
    expect(await t.unread()).toBe(4);
  });

  it('ミュートした相手の Bluesky の通知を一覧と未読数から除き、Fediverse の通知は残す', async () => {
    const t = setup();
    t.moderate(1, null);

    expect(await t.listed()).toEqual([t.ids.fediverseLike]);
    expect(await t.unread()).toBe(1);
  });

  it('ブロックした相手の Bluesky の通知を一覧と未読数から除き、Fediverse の通知は残す', async () => {
    const t = setup();
    t.moderate(0, BLOCK);

    expect(await t.listed()).toEqual([t.ids.fediverseLike]);
    expect(await t.unread()).toBe(1);
  });

  it('ミュートもブロックもしていない行は通知を除かない', async () => {
    const t = setup();
    t.moderate(0, null);

    expect(await t.listed()).toHaveLength(4);
    expect(await t.unread()).toBe(4);
  });

  it('別の DID の Bluesky の通知は残す', async () => {
    const t = setup();
    t.sqlite.prepare('INSERT INTO bluesky_moderated_actors(did,muted,blockUri,updatedAt) VALUES (?,?,?,?)')
      .run('did:plc:someone-else', 1, null, 1);

    expect(await t.listed()).toHaveLength(4);
    expect(await t.unread()).toBe(4);
  });

  it('マーカーより新しい通知の未読数からも、対象の相手の通知を除く', async () => {
    const t = setup();
    t.seed.setMarker(t.me.userId, 'notifications', t.ids.blueskyLike);
    expect(await t.unread()).toBe(2);

    t.moderate(1, null);

    expect(await t.unread()).toBe(0);
  });
});
