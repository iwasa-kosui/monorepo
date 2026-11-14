import { afterEach, describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { createD1AiAgentBotRepliedCountResolverSince } from '../aiAgentBot/aiAgentBotRepliedCountResolverSince.ts';
import { createD1AiAgentBotTriggerClaimedStore } from '../aiAgentBot/aiAgentBotTriggerClaimedStore.ts';
import { createD1AiAgentBotTriggersHandledStore } from '../aiAgentBot/aiAgentBotTriggersHandledStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  return fixture;
};

const postId = PostId.orThrow('0192f6a0-0000-7000-8000-000000000001');

describe('createD1AiAgentBotTriggerClaimedStore', () => {
  it('同じトリガーへの印は最初の 1 回だけが通る（重なった cron が両方とも返信しない）', async () => {
    const { db } = setup();
    const store = createD1AiAgentBotTriggerClaimedStore(db);

    const first = await store.store({ postId, claimedAt: Instant.orThrow(1_000) });
    const second = await store.store({ postId, claimedAt: Instant.orThrow(2_000) });

    expect([first.val, second.val]).toEqual([true, false]);
  });

  it('処理済みのトリガーには印を付けられない', async () => {
    const { db } = setup();
    await createD1AiAgentBotTriggersHandledStore(db).store({
      postId,
      outcome: 'replied',
      reason: null,
      handledAt: Instant.orThrow(1_000),
    });

    const claimed = await createD1AiAgentBotTriggerClaimedStore(db).store({
      postId,
      claimedAt: Instant.orThrow(2_000),
    });

    expect(claimed.val).toBe(false);
  });
});

describe('createD1AiAgentBotTriggersHandledStore', () => {
  it('印を結果で上書きし、返信が 1 日の上限に数えられる', async () => {
    const { db } = setup();
    await createD1AiAgentBotTriggerClaimedStore(db).store({ postId, claimedAt: Instant.orThrow(1_000) });

    await createD1AiAgentBotTriggersHandledStore(db).store({
      postId,
      outcome: 'replied',
      reason: null,
      handledAt: Instant.orThrow(2_000),
    });

    const replied = await createD1AiAgentBotRepliedCountResolverSince(db).resolve(Instant.orThrow(0));
    expect(replied.val).toBe(1);
  });
});
