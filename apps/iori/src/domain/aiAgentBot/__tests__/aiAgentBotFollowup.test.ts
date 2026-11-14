import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import { PostId } from '../../post/postId.ts';
import { BOT_TRIGGER_EXPIRY_MS, MAX_BOT_REPLIES_PER_THREAD } from '../aiAgentBot.ts';
import {
  AiAgentBotFollowup,
  MAX_FOLLOWUP_DELAY_MINUTES,
  MAX_FOLLOWUP_NOTE_CHARACTERS,
  MAX_FOLLOWUP_ROUNDS,
  MIN_FOLLOWUP_DELAY_MINUTES,
} from '../aiAgentBotFollowup.ts';

const NOW = Instant.orThrow(1_800_000_000_000);
const base = {
  postId: PostId.generate(),
  authorActorId: ActorId.generate(),
  note: '公式発表を確かめる',
  delayMinutes: 60,
  round: 1,
  now: NOW,
};

describe('AiAgentBotFollowup.schedule', () => {
  it('待ち時間のぶん先を期日にする', () => {
    const followup = AiAgentBotFollowup.schedule(base);
    expect(followup.ok && followup.val.dueAt).toBe(NOW + 60 * 60 * 1000);
  });

  it.each([
    [MIN_FOLLOWUP_DELAY_MINUTES - 1, false],
    [MIN_FOLLOWUP_DELAY_MINUTES, true],
    [MAX_FOLLOWUP_DELAY_MINUTES, true],
    [MAX_FOLLOWUP_DELAY_MINUTES + 1, false],
    [30.5, false],
  ])('待ち時間 %d 分を受け付けるか: %s', (delayMinutes, ok) => {
    expect(AiAgentBotFollowup.schedule({ ...base, delayMinutes }).ok).toBe(ok);
  });

  it('空白だけのメモは受け付けない', () => {
    expect(AiAgentBotFollowup.schedule({ ...base, note: '  \n ' })).toMatchObject({ err: { type: 'emptyNote' } });
  });

  it('長すぎるメモは上限で切り詰める', () => {
    const followup = AiAgentBotFollowup.schedule({ ...base, note: 'あ'.repeat(MAX_FOLLOWUP_NOTE_CHARACTERS + 10) });
    expect(followup.ok && [...followup.val.note].length).toBe(MAX_FOLLOWUP_NOTE_CHARACTERS);
  });

  it('重ねられる回数を超えた予定は入れない', () => {
    expect(AiAgentBotFollowup.schedule({ ...base, round: MAX_FOLLOWUP_ROUNDS }).ok).toBe(true);
    expect(AiAgentBotFollowup.schedule({ ...base, round: MAX_FOLLOWUP_ROUNDS + 1 })).toMatchObject({
      err: { type: 'roundLimit' },
    });
  });
});

describe('AiAgentBotFollowup.decide', () => {
  const followup = AiAgentBotFollowup.schedule(base);
  if (!followup.ok) throw new Error('unreachable');
  const dueAt = followup.val.dueAt;

  it('期日から長く過ぎた予定は実行しない', () => {
    expect(AiAgentBotFollowup.decide({
      followup: followup.val,
      botRepliesInThread: 0,
      now: Instant.addDuration(dueAt, BOT_TRIGGER_EXPIRY_MS + 1),
    })).toEqual({ type: 'ignore', reason: 'expired' });
  });

  it('スレッドで返信の上限に達していたら実行しない', () => {
    expect(AiAgentBotFollowup.decide({
      followup: followup.val,
      botRepliesInThread: MAX_BOT_REPLIES_PER_THREAD,
      now: dueAt,
    })).toEqual({ type: 'ignore', reason: 'threadLimit' });
  });

  it('期日を迎えた予定は実行する', () => {
    expect(AiAgentBotFollowup.decide({ followup: followup.val, botRepliesInThread: 0, now: dueAt })).toEqual({
      type: 'followUp',
    });
  });
});
