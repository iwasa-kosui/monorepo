import { describe, expect, it } from 'vitest';

import { FederatedTimelineItem } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { createD1FederatedTimelineItemCreatedStore } from '../federatedTimeline/federatedTimelineItemCreatedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const post = seed.addRemotePost(seed.addRemoteActor('alice'), 1_000);
  const relayId = seed.addRelay();
  const otherRelayId = seed.addRelay();
  const createdEvent = (receivedAt: number, relay: string = relayId) =>
    FederatedTimelineItem.createFederatedTimelineItem({
      federatedTimelineItemId: FederatedTimelineItemId.generate(),
      postId: PostId.orThrow(post.postId),
      relayId: RelayId.orThrow(relay),
      receivedAt,
    }, Instant.orThrow(receivedAt));
  const count = (table: string) =>
    Number((fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);
  return { fixture, createdEvent, otherRelayId, count };
};

describe('createD1FederatedTimelineItemCreatedStore', () => {
  it('同じ post_id で同じ relay_id の項目を2回保存すると2回目は失敗し、項目もドメインイベントも1件のまま残る', async () => {
    const { fixture, createdEvent, count } = setup();
    const store = createD1FederatedTimelineItemCreatedStore(fixture.db);

    await store.store(createdEvent(2_000));
    await expect(store.store(createdEvent(3_000))).rejects.toThrow();

    expect(count('federated_timeline_items')).toBe(1);
    expect(count('domain_events')).toBe(1);
  });

  it('同じ post_id でも relay_id が違う項目は2件とも保存できる', async () => {
    const { fixture, createdEvent, otherRelayId, count } = setup();
    const store = createD1FederatedTimelineItemCreatedStore(fixture.db);

    await store.store(createdEvent(2_000));
    await store.store(createdEvent(3_000, otherRelayId));

    expect(count('federated_timeline_items')).toBe(2);
    expect(count('domain_events')).toBe(2);
  });
});
