import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { AiAgentBotFollowup } from '../../../domain/aiAgentBot/aiAgentBotFollowup.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import {
  createD1AiAgentBotDueFollowupsResolver,
  createD1AiAgentBotPendingFollowupsCountResolver,
} from '../aiAgentBot/aiAgentBotDueFollowupsResolver.ts';
import { createD1AiAgentBotFollowupClaimedStore } from '../aiAgentBot/aiAgentBotFollowupClaimedStore.ts';
import { createD1AiAgentBotFollowupScheduledStore } from '../aiAgentBot/aiAgentBotFollowupScheduledStore.ts';
import { createD1AiAgentBotFollowupsHandledStore } from '../aiAgentBot/aiAgentBotFollowupsHandledStore.ts';
import { createD1AiAgentBotRepliedCountResolverSince } from '../aiAgentBot/aiAgentBotRepliedCountResolverSince.ts';
import { createD1AiAgentBotTriggersHandledStore } from '../aiAgentBot/aiAgentBotTriggersHandledStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 14, 0, 0));
const minutes = (n: number) => Instant.addDuration(NOW, n * 60 * 1000);

const followupDueIn = (delayMinutes: number, note = `${delayMinutes} 分後`) => {
  const followup = AiAgentBotFollowup.schedule({
    postId: PostId.generate(),
    authorActorId: ActorId.generate(),
    note,
    delayMinutes,
    round: 1,
    now: NOW,
  });
  if (!followup.ok) throw new Error('invalid follow-up');
  return followup.val;
};

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  return {
    sqlite,
    scheduledStore: createD1AiAgentBotFollowupScheduledStore(db),
    claimedStore: createD1AiAgentBotFollowupClaimedStore(db),
    handledStore: createD1AiAgentBotFollowupsHandledStore(db),
    dueResolver: createD1AiAgentBotDueFollowupsResolver(db),
    pendingCountResolver: createD1AiAgentBotPendingFollowupsCountResolver(db),
    repliedCountResolver: createD1AiAgentBotRepliedCountResolverSince(db),
    triggersHandledStore: createD1AiAgentBotTriggersHandledStore(db),
  };
};

describe('AI エージェントの bot のフォローアップの D1 アダプタ', () => {
  it('期日を迎えて、まだ処理し始めていない予定だけを、期日の古い順に返す', async () => {
    const { scheduledStore, claimedStore, dueResolver } = setup();
    const later = followupDueIn(30);
    const earlier = followupDueIn(10);
    const claimed = followupDueIn(20);
    const notYet = followupDueIn(120);
    await scheduledStore.store(later, earlier, claimed, notYet);
    await claimedStore.store({ followupId: claimed.followupId, claimedAt: minutes(20) });

    const due = Result.unsafeUnwrap(await dueResolver.resolve({ now: minutes(60), limit: 10 }));

    expect(due).toEqual([earlier, later]);
  });

  it('処理中の印は 1 回しか付けられない（重なった cron の 1 つだけが処理する）', async () => {
    const { scheduledStore, claimedStore } = setup();
    const followup = followupDueIn(10);
    await scheduledStore.store(followup);

    const first = await claimedStore.store({ followupId: followup.followupId, claimedAt: minutes(10) });
    const second = await claimedStore.store({ followupId: followup.followupId, claimedAt: minutes(11) });

    expect([Result.unsafeUnwrap(first), Result.unsafeUnwrap(second)]).toEqual([true, false]);
  });

  it('処理済みの記録は上書きしない', async () => {
    const { scheduledStore, handledStore, sqlite } = setup();
    const followup = followupDueIn(10);
    await scheduledStore.store(followup);
    const { followupId } = followup;
    await handledStore.store({ followupId, outcome: 'ignored', reason: 'noReply', handledAt: minutes(10) });
    await handledStore.store({ followupId, outcome: 'replied', reason: null, handledAt: minutes(11) });

    expect(sqlite.prepare('SELECT outcome FROM ai_agent_bot_followups').all()).toEqual([{ outcome: 'ignored' }]);
  });

  it('未処理の予定を数える', async () => {
    const { scheduledStore, handledStore, pendingCountResolver } = setup();
    const [a, b] = [followupDueIn(10), followupDueIn(20)];
    await scheduledStore.store(a, b);
    await handledStore.store({ followupId: a.followupId, outcome: 'failed', reason: 'x', handledAt: minutes(10) });

    expect(Result.unsafeUnwrap(await pendingCountResolver.resolve({}))).toBe(1);
  });

  it('24 時間の返信数に、メンションへの返信とフォローアップの続報を合わせて数える', async () => {
    const { scheduledStore, handledStore, triggersHandledStore, repliedCountResolver } = setup();
    const [replied, ignored] = [followupDueIn(10), followupDueIn(20)];
    await scheduledStore.store(replied, ignored);
    await handledStore.store(
      { followupId: replied.followupId, outcome: 'replied', reason: null, handledAt: minutes(10) },
      { followupId: ignored.followupId, outcome: 'ignored', reason: 'noReply', handledAt: minutes(20) },
    );
    await triggersHandledStore.store(
      { postId: PostId.generate(), outcome: 'replied', reason: null, handledAt: minutes(5) },
      { postId: PostId.generate(), outcome: 'replied', reason: null, handledAt: minutes(-60) },
    );

    expect(Result.unsafeUnwrap(await repliedCountResolver.resolve(NOW))).toBe(2);
  });
});
