import { createAiAgentBotRuntime, createRetireAiAgentBotAccounts } from '../runtime/aiAgentBot.ts';
import { createWorkerRuntimePorts } from '../runtime/workerRuntime.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask, ScheduledTaskContext } from './scheduledTasks.ts';

type CreateBotRuntime = (
  env: IoriWorkerEnv,
  waitUntil: ScheduledTaskContext['waitUntil'],
) => ReturnType<typeof createAiAgentBotRuntime>;

const defaultCreateBotRuntime: CreateBotRuntime = (env, waitUntil) =>
  createAiAgentBotRuntime(env, () => createWorkerRuntimePorts(env, waitUntil));

export const createRespondToAiAgentMentionsTask = (createBotRuntime: CreateBotRuntime): ScheduledTask => ({
  name: 'respondToAiAgentMentions',
  run: async ({ env, waitUntil }) => {
    const bot = await createBotRuntime(env, waitUntil);
    if (bot === undefined) {
      console.info('iori ai agent bot is disabled.');
      return;
    }
    const result = await bot.respondToMentions.run({
      bot: { userId: bot.bot.user.id, actorId: bot.bot.actor.id },
      capabilities: bot.capabilities,
      replier: bot.replier,
    });
    console.info('iori ai agent bot responded to mentions.', result.val);
  },
});

export const createRunAiAgentFollowupsTask = (createBotRuntime: CreateBotRuntime): ScheduledTask => ({
  name: 'runAiAgentFollowups',
  run: async ({ env, waitUntil }) => {
    const bot = await createBotRuntime(env, waitUntil);
    if (bot === undefined) {
      console.info('iori ai agent bot is disabled.');
      return;
    }
    const result = await bot.runFollowups.run({
      bot: { userId: bot.bot.user.id, actorId: bot.bot.actor.id },
      capabilities: bot.capabilities,
      replier: bot.replier,
    });
    console.info('iori ai agent bot ran follow-ups.', result.val);
  },
});

export const createPostAiAgentMusingTask = (createBotRuntime: CreateBotRuntime): ScheduledTask => ({
  name: 'postAiAgentMusing',
  run: async ({ env, waitUntil }) => {
    const bot = await createBotRuntime(env, waitUntil);
    if (bot === undefined) {
      console.info('iori ai agent bot is disabled.');
      return;
    }
    const result = await bot.postMusing.run(bot);
    if (!result.ok) {
      console.error(`iori ai agent bot: musing failed. ${result.err.message}`);
      return;
    }
    console.info('iori ai agent bot mused.', result.val);
  },
});

export const createFollowBackAiAgentFollowersTask = (createBotRuntime: CreateBotRuntime): ScheduledTask => ({
  name: 'followBackAiAgentFollowers',
  run: async ({ env, waitUntil }) => {
    const bot = await createBotRuntime(env, waitUntil);
    if (bot === undefined) {
      console.info('iori ai agent bot is disabled.');
      return;
    }
    const result = await bot.followBack.run({ botActorId: bot.bot.actor.id, follower: bot.follower });
    if (result.val.followed > 0 || result.val.failed > 0) {
      console.info('iori ai agent bot followed back.', result.val);
    }
  },
});

/** 以前 bot に使っていたアカウントを消す。bot が無効でも、残っているアカウントは消す */
export const retireAiAgentBotAccountsTask: ScheduledTask = {
  name: 'retireAiAgentBotAccounts',
  run: async ({ env, waitUntil }) => {
    const retire = await createRetireAiAgentBotAccounts(env, () => createWorkerRuntimePorts(env, waitUntil));
    const result = await retire();
    if (result.val.retired.length > 0 || result.val.failed.length > 0) {
      console.info('iori ai agent bot: retired old accounts.', result.val);
    }
  },
};

export const respondToAiAgentMentionsTask = createRespondToAiAgentMentionsTask(defaultCreateBotRuntime);
export const runAiAgentFollowupsTask = createRunAiAgentFollowupsTask(defaultCreateBotRuntime);
export const postAiAgentMusingTask = createPostAiAgentMusingTask(defaultCreateBotRuntime);
export const followBackAiAgentFollowersTask = createFollowBackAiAgentFollowersTask(defaultCreateBotRuntime);
